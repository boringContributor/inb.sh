import { integrationDefinition, type IntegrationKind, statusLabel } from "@inb/shared";
import type { DeliveryContext, OutboundRequest } from "./job.ts";

export interface SendResult {
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
  /** a 4xx from the destination won't get better on retry */
  retryable: boolean;
}

const TIMEOUT_MS = 15_000;

export function encodeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  return typeof body === "string" ? body : JSON.stringify(body);
}

async function timedFetch(url: string, init: RequestInit): Promise<SendResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // drain so the connection can be reused
    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - started,
      error: res.ok ? null : `${statusLabel(res.status)}${text ? `: ${text.slice(0, 200)}` : ""}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (err) {
    return { ok: false, status: null, durationMs: Date.now() - started, error: String((err as Error).message ?? err), retryable: true };
  }
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "inbound/1.0", ...headers },
  body: JSON.stringify(body),
});

function preview(body: unknown, max = 2800): string {
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

/** Forward a request 1:1 (replay, HTTP forward, Zapier, n8n). */
export function forward(url: string, payload: OutboundRequest, extraHeaders: Record<string, string> = {}) {
  const headers = { ...payload.headers, ...extraHeaders, "x-inbound-forwarded": "1" };
  const method = payload.method.toUpperCase();
  return timedFetch(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : encodeBody(payload.body),
    redirect: "manual",
  });
}

export async function send(
  kind: IntegrationKind,
  config: Record<string, string>,
  ctx: DeliveryContext,
  payload: OutboundRequest,
  archive: R2Bucket,
): Promise<SendResult> {
  const title = `${payload.method} ${ctx.summary}`;
  const meta = `${ctx.endpointName} · ${statusLabel(ctx.status)} · ${ctx.requestId}`;
  switch (kind) {
    case "slack":
      return timedFetch(
        config.url!,
        json({
          text: `${title} — ${meta}`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${meta}` } },
            { type: "section", text: { type: "mrkdwn", text: "```" + preview(payload.body) + "```" } },
          ],
        }),
      );
    case "discord":
      return timedFetch(
        config.url!,
        json({
          embeds: [
            {
              title,
              description: "```json\n" + preview(payload.body, 3800) + "\n```",
              footer: { text: meta },
              timestamp: ctx.receivedAt,
              color: ctx.status >= 500 ? 0xdb3b3e : ctx.status >= 400 ? 0xf7b750 : 0x17c964,
            },
          ],
        }),
      );
    case "teams":
      return timedFetch(
        config.url!,
        json({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  { type: "TextBlock", size: "Medium", weight: "Bolder", text: title },
                  { type: "TextBlock", isSubtle: true, text: meta, wrap: true },
                  { type: "TextBlock", fontType: "Monospace", text: preview(payload.body, 2000), wrap: true },
                ],
              },
            },
          ],
        }),
      );
    case "http":
      return forward(config.url!, payload, config.authorization ? { authorization: config.authorization } : {});
    case "zapier":
    case "n8n":
      return timedFetch(config.url!, json({ ...ctx, request: payload }));
    case "github-actions":
      return timedFetch(
        `https://api.github.com/repos/${config.repo}/dispatches`,
        json(
          { event_type: config.eventType || "inbound", client_payload: { ...ctx, body: payload.body } },
          { authorization: `Bearer ${config.token}`, accept: "application/vnd.github+json" },
        ),
      );
    case "datadog":
      return timedFetch(
        `https://http-intake.logs.${config.site || "datadoghq.com"}/api/v2/logs`,
        json(
          [
            {
              ddsource: "inbound",
              service: config.service || "inbound",
              hostname: ctx.endpointSlug,
              status: ctx.status >= 500 ? "error" : ctx.status >= 400 ? "warn" : "info",
              message: title,
              inbound: { ...ctx, method: payload.method, path: payload.path, headers: payload.headers, body: payload.body },
            },
          ],
          { "dd-api-key": config.apiKey! },
        ),
      );
    case "grafana":
      return timedFetch(
        config.url!,
        json(
          {
            streams: [
              {
                stream: { source: "inbound", endpoint: ctx.endpointSlug, method: payload.method },
                values: [[`${Date.parse(ctx.receivedAt)}000000`, JSON.stringify({ ...ctx, body: payload.body })]],
              },
            ],
          },
          config.authorization ? { authorization: config.authorization } : {},
        ),
      );
    case "pagerduty":
      return timedFetch(
        "https://events.pagerduty.com/v2/enqueue",
        json({
          routing_key: config.routingKey,
          event_action: "trigger",
          dedup_key: `inbound-${ctx.endpointId}-${ctx.status}`,
          payload: {
            summary: `${title} (${statusLabel(ctx.status)})`,
            source: ctx.endpointName,
            severity: ctx.status >= 500 ? "error" : "warning",
            custom_details: { ...ctx, body: payload.body },
          },
        }),
      );
    case "sentry": {
      const dsn = new URL(config.dsn!);
      const projectId = dsn.pathname.replace(/\//g, "");
      return timedFetch(
        `${dsn.protocol}//${dsn.host}/api/${projectId}/store/`,
        json(
          {
            message: title,
            level: ctx.status >= 500 ? "error" : "warning",
            platform: "other",
            tags: { endpoint: ctx.endpointSlug, status: String(ctx.status) },
            extra: { ...ctx, headers: payload.headers, body: payload.body },
          },
          { "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=inbound/1.0` },
        ),
      );
    }
    case "kafka":
      return timedFetch(
        `${config.restProxyUrl!.replace(/\/$/, "")}/topics/${encodeURIComponent(config.topic!)}`,
        {
          method: "POST",
          headers: { "content-type": "application/vnd.kafka.json.v2+json" },
          body: JSON.stringify({ records: [{ key: ctx.requestId, value: { ...ctx, body: payload.body } }] }),
        },
      );
    case "r2": {
      const started = Date.now();
      const date = ctx.receivedAt.slice(0, 10);
      const key = `${config.prefix || "inbound-archive/raw/"}${ctx.endpointSlug}/${date}/${ctx.requestId}.json`;
      try {
        await archive.put(key, JSON.stringify({ ...ctx, request: payload }), {
          httpMetadata: { contentType: "application/json" },
        });
        return { ok: true, status: 200, durationMs: Date.now() - started, error: null, retryable: false };
      } catch (err) {
        return { ok: false, status: null, durationMs: Date.now() - started, error: String(err), retryable: true };
      }
    }
    case "cli":
      return { ok: true, status: 200, durationMs: 0, error: null, retryable: false };
    case "postgres":
    case "bigquery":
      return {
        ok: false,
        status: null,
        durationMs: 0,
        error: `${integrationDefinition(kind).name} delivery is not available yet`,
        retryable: false,
      };
  }
}
