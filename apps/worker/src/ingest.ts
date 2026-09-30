import {
  type CapturedRequest,
  type RequestContext,
  type RequestEvent,
  type ResponseSource,
  defaultReply,
  evaluateConditions,
  nowContext,
  parseBody,
  referencesResponse,
  renderConfiguredReply,
  renderTemplate,
  summarizeRequest,
} from "@inb/shared";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Env, WaitUntil } from "./env.ts";
import { type DB, type EndpointRow, type RuleRow, activeRules, findEndpointBySlug, getDb, schema } from "./db/repo.ts";
import type { StoredRequest } from "./hub.ts";
import { requestId as newRequestId } from "./lib/ids.ts";
import { verifySignature } from "./lib/signature.ts";
import { runTransform } from "./lib/transform.ts";
import { toBase64 } from "./lib/crypto.ts";
import type { DeliveryContext, DeliveryJob, OutboundRequest } from "./deliver/job.ts";
import { encodeBody } from "./deliver/send.ts";

/** Bodies above this are stored truncated; the full body is still forwarded. */
const MAX_STORED_BODY = 1024 * 1024;
const MAX_BODY = 10 * 1024 * 1024;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/;

export function isPrivateUrl(url: string): boolean {
  try {
    return PRIVATE_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

interface Reply {
  status: number;
  headers: [string, string][];
  body: string;
  source: ResponseSource;
}

async function readBody(req: Request): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new PayloadTooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

class PayloadTooLarge extends Error {}

function isText(contentType: string | null, bytes: Uint8Array): boolean {
  if (!bytes.length) return true;
  const ct = (contentType ?? "").toLowerCase();
  if (/json|text|xml|x-www-form-urlencoded|javascript|graphql|yaml|csv/.test(ct)) return true;
  if (ct && !ct.startsWith("application/octet-stream")) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 4096));
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture a request to `/<slug>/<path>`: store it, run rules, answer with
 * the endpoint's configured response, and queue deliveries. Everything
 * after the reply runs in `waitUntil` so the sender only waits for the
 * response itself.
 */
export async function handleCapture(
  env: Env,
  exec: WaitUntil,
  req: Request,
  slug: string,
  path: string,
): Promise<Response> {
  const started = Date.now();
  const receivedAt = new Date(started);
  const db = await getDb(env.Database);
  const endpoint = await findEndpointBySlug(db, slug);
  if (!endpoint) {
    return Response.json({ error: "unknown endpoint", slug }, { status: 404, headers: { "x-inbound": "unknown-endpoint" } });
  }

  if (req.method === "OPTIONS" && req.headers.get("access-control-request-method")) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": req.headers.get("origin") ?? "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": req.headers.get("access-control-request-headers") ?? "*",
        "access-control-max-age": "86400",
      },
    });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBody(req);
  } catch (err) {
    if (err instanceof PayloadTooLarge) return Response.json({ error: "payload too large" }, { status: 413 });
    throw err;
  }

  const url = new URL(req.url);
  const id = newRequestId();
  const contentType = req.headers.get("content-type");
  const text = isText(contentType, bytes);
  const rawBody = text ? new TextDecoder().decode(bytes) : "";
  const headers: [string, string][] = [...req.headers.entries()];
  const headerMap = Object.fromEntries(headers.map(([k, v]) => [k.toLowerCase(), v]));
  const query: [string, string][] = [...url.searchParams.entries()];
  const body = text ? parseBody(rawBody, contentType) : null;
  const country = (req.cf?.country as string | undefined) ?? null;
  const ip = req.headers.get("cf-connecting-ip");

  const signature = endpoint.signing
    ? { provider: endpoint.signing.provider, verified: await verifySignature(endpoint.signing, req.headers, bytes) }
    : null;

  const ctx: RequestContext = {
    request: {
      id,
      method: req.method,
      path,
      url: req.url,
      query: Object.fromEntries(query),
      headers: headerMap,
      body,
      rawBody,
      ip,
      country,
      signature,
    },
    endpoint: { id: endpoint.id, slug: endpoint.slug, name: endpoint.name },
    now: nowContext(receivedAt),
  };

  const rules = await activeRules(db, endpoint.id);
  const preRules = rules.filter((r) => !referencesResponse(r.conditions));
  const postRules = rules.filter((r) => referencesResponse(r.conditions));
  const matchedPre = preRules.filter((r) => evaluateConditions(ctx, r.conditions));

  const reply = await buildReply(endpoint, matchedPre, ctx, req, bytes, path, url);
  const durationMs = Date.now() - started;

  const responseCtx: RequestContext = { ...ctx, response: { status: reply.status } };
  const matchedPost = postRules.filter((r) => evaluateConditions(responseCtx, r.conditions));
  const matched = [...matchedPre, ...matchedPost];
  const dropped = matched.some((r) => r.actions.some((a) => a.type === "drop"));

  const summary = summarizeRequest({ method: req.method, path, headers: headerMap, body });
  const storedBody = text ? rawBody : toBase64(bytes);
  const stored: StoredRequest = {
    id,
    endpointId: endpoint.id,
    method: req.method,
    path,
    status: reply.status,
    size: bytes.byteLength,
    contentType,
    summary: signature && !signature.verified && reply.status === 401 ? "signature verification failed" : summary,
    receivedAt: receivedAt.toISOString(),
    replayCount: 0,
    query,
    headers,
    body: storedBody.length > MAX_STORED_BODY ? storedBody.slice(0, MAX_STORED_BODY) : storedBody,
    bodyEncoding: text ? "utf8" : "base64",
    bodyTruncated: storedBody.length > MAX_STORED_BODY,
    ip,
    country,
    userAgent: req.headers.get("user-agent"),
    signature,
    response: { ...reply, durationMs },
    matchedRules: matched.map((r) => ({ id: r.id, name: r.name })),
  };

  const iso = receivedAt.toISOString();
  const events: RequestEvent[] = [
    { type: "received", at: iso, label: "Received", detail: new Date(iso).toISOString().slice(11, 23) },
    {
      type: "matched",
      at: iso,
      label: "Matched rule",
      detail: matched.length ? `${matched.length} of ${rules.length} rules` : `0 of ${rules.length} rules`,
    },
    {
      type: "responded",
      at: new Date(started + durationMs).toISOString(),
      label: `Responded ${reply.status}`,
      detail: `${reply.source} · ${durationMs} ms`,
    },
  ];

  exec.waitUntil(
    afterReply(env, db, endpoint, stored, events, matched, ctx, dropped).catch((err) =>
      console.error("post-capture pipeline failed", { requestId: id, err: String(err) }),
    ),
  );

  const res = new Response(req.method === "HEAD" ? null : reply.body, { status: reply.status, headers: reply.headers });
  res.headers.set("x-inbound-id", id);
  return res;
}

async function buildReply(
  endpoint: EndpointRow,
  matched: RuleRow[],
  ctx: RequestContext,
  req: Request,
  bytes: Uint8Array,
  path: string,
  url: URL,
): Promise<Reply> {
  for (const rule of matched) {
    const respond = rule.actions.find((a) => a.type === "respond");
    if (respond?.type === "respond") {
      return {
        status: respond.status,
        headers: [["content-type", respond.contentType]],
        body: renderTemplate(respond.body, ctx, respond.contentType.includes("json")),
        source: "rule",
      };
    }
  }

  const cfg = endpoint.response;
  if (cfg.enabled) {
    if (cfg.delayMs > 0) await new Promise((r) => setTimeout(r, cfg.delayMs));
    if (cfg.mode === "proxy" && cfg.proxyUrl) {
      const target = new URL(cfg.proxyUrl.replace(/\/$/, "") + path);
      target.search = url.search;
      const headers = new Headers(req.headers);
      headers.delete("host");
      try {
        const upstream = await fetch(target, {
          method: req.method,
          headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : bytes,
          redirect: "manual",
          signal: AbortSignal.timeout(25_000),
        });
        return {
          status: upstream.status,
          headers: [...upstream.headers.entries()].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k)),
          body: await upstream.text(),
          source: "proxy",
        };
      } catch (err) {
        return {
          status: 502,
          headers: [["content-type", "application/json"]],
          body: JSON.stringify({ error: "upstream unreachable", detail: String((err as Error).message ?? err) }),
          source: "proxy",
        };
      }
    }
    return { ...renderConfiguredReply(cfg, ctx), source: "custom" };
  }

  return { ...defaultReply(ctx.request.id), source: "default" };
}

async function afterReply(
  env: Env,
  db: DB,
  endpoint: EndpointRow,
  stored: StoredRequest,
  events: RequestEvent[],
  matched: RuleRow[],
  ctx: RequestContext,
  dropped: boolean,
) {
  const hub = env.Hub.get(env.Hub.idFromName(endpoint.id));
  const now = new Date();

  const counters = db
    .update(schema.endpoints)
    .set({ requestCount: sql`${schema.endpoints.requestCount} + 1`, lastRequestAt: now })
    .where(eq(schema.endpoints.id, endpoint.id));

  if (dropped) {
    await counters;
    return;
  }
  await hub.ingest(stored, events);

  const context: DeliveryContext = {
    requestId: stored.id,
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    endpointSlug: endpoint.slug,
    status: stored.status,
    summary: stored.summary,
    receivedAt: stored.receivedAt,
  };
  const base: OutboundRequest = {
    method: stored.method,
    path: stored.path,
    headers: ctx.request.headers,
    body: ctx.request.body ?? (stored.bodyEncoding === "utf8" ? stored.body : null),
  };

  const jobs: DeliveryJob[] = [];
  const statements: BatchItem<"sqlite">[] = [];
  const extraEvents: RequestEvent[] = [];
  for (const rule of matched) {
    let payload = base;
    if (rule.transform?.trim()) {
      try {
        payload = await runTransform(rule.transform, { ...base, query: ctx.request.query });
      } catch (err) {
        extraEvents.push({
          type: "delivery_failed",
          at: new Date().toISOString(),
          label: "Transform failed",
          detail: `${rule.name}: ${String((err as Error).message ?? err)}`,
        });
        continue;
      }
    }
    const blocked = rule.actions.some((a) => a.type === "respond" && a.status >= 400);
    statements.push(
      db
        .update(schema.rules)
        .set({
          runs: sql`${schema.rules.runs} + 1`,
          blocked: blocked ? sql`${schema.rules.blocked} + 1` : schema.rules.blocked,
          lastRunAt: now,
        })
        .where(eq(schema.rules.id, rule.id)),
    );
    for (const action of rule.actions) {
      if (action.type === "forward") {
        const integration = await db.query.integrations.findFirst({ where: eq(schema.integrations.id, action.integrationId) });
        if (!integration?.enabled) continue;
        if (integration.kind === "cli") continue;
        jobs.push({ type: "integration", integrationId: integration.id, kind: integration.kind, ruleId: rule.id, context, payload });
      } else if (action.type === "replay") {
        if (isPrivateUrl(action.url)) {
          const request = { ...stored, events: [], body: encodeBody(payload.body) ?? "", headers: Object.entries(payload.headers) };
          const n = await hub.tunnel({ request, url: action.url });
          if (!n && !action.onlyWhileTunnel) {
            extraEvents.push({ type: "delivery_failed", at: new Date().toISOString(), label: "Replay skipped", detail: `no tunnel open for ${action.url}` });
          }
        } else {
          jobs.push({ type: "replay", url: action.url, ruleId: rule.id, context, payload });
        }
      } else if (action.type === "archive") {
        const full: CapturedRequest = { ...stored, events };
        statements.push(
          db
            .insert(schema.archived)
            .values({
              id: stored.id,
              endpointId: endpoint.id,
              data: full,
              method: stored.method,
              path: stored.path,
              status: stored.status,
              summary: stored.summary,
              size: stored.size,
              receivedAt: new Date(stored.receivedAt),
              archivedAt: now,
            })
            .onConflictDoNothing(),
        );
      }
    }
  }

  await db.batch([counters, ...statements]);
  if (jobs.length) await env.Deliveries.sendBatch(jobs.map((body) => ({ body, contentType: "json" })));
  if (extraEvents.length) await hub.addEvents(stored.id, extraEvents);
}
