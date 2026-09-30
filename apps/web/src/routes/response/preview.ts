import {
  type CapturedRequest,
  type Endpoint,
  type RequestContext,
  type ResponseConfig,
  STATUS_TEXT,
  contextFromCaptured,
  defaultReply,
  renderConfiguredReply,
} from "@inb/shared";

export interface PreviewResponse {
  kind: "http";
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  /** content type says JSON but the body (after rendering) doesn't parse */
  invalidJson: boolean;
  isJson: boolean;
}

export interface ProxyPreview {
  kind: "proxy";
  url: string;
  delayMs: number;
}

/** Stand-in for when the endpoint hasn't received anything yet. */
export function sampleRequest(endpoint: Pick<Endpoint, "id">): CapturedRequest {
  const body = JSON.stringify(
    {
      id: "evt_1QMxk2A9sT4bQzLp",
      object: "event",
      type: "invoice.payment_succeeded",
      data: { object: { id: "in_1QMxk0A9sT4bQzLp", amount_paid: 4900, currency: "eur" } },
    },
    null,
    2,
  );
  const now = new Date().toISOString();
  return {
    id: "req_8f2a91c4e7",
    endpointId: endpoint.id,
    method: "POST",
    path: "/hooks/stripe",
    status: 200,
    size: body.length,
    contentType: "application/json",
    summary: "invoice.payment_succeeded",
    receivedAt: now,
    replayCount: 0,
    query: [],
    headers: [
      ["content-type", "application/json"],
      ["user-agent", "Stripe/1.0 (+https://stripe.com/docs/webhooks)"],
      [
        "stripe-signature",
        "t=1727712043,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd",
      ],
    ],
    body,
    bodyEncoding: "utf8",
    bodyTruncated: false,
    ip: "54.187.174.169",
    country: "US",
    userAgent: "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
    signature: null,
    response: { status: 200, headers: [], body: "", durationMs: 0, source: "default" },
    matchedRules: [],
    events: [],
  };
}

export function previewContext(
  request: CapturedRequest,
  endpoint: Pick<Endpoint, "id" | "slug" | "name">,
  captureBaseUrl: string,
): RequestContext {
  return contextFromCaptured(request, endpoint, captureBaseUrl);
}

const isJsonType = (ct: string) => /json/i.test(ct);

function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Uses the same renderers as the worker (`@inb/shared` reply.ts), so the
 * preview is exactly what a sender receives.
 */
export function buildPreview(
  cfg: ResponseConfig,
  ctx: RequestContext,
): PreviewResponse | ProxyPreview {
  if (cfg.enabled && cfg.mode === "proxy")
    return { kind: "proxy", url: cfg.proxyUrl ?? "", delayMs: cfg.delayMs };
  const reply = cfg.enabled ? renderConfiguredReply(cfg, ctx) : defaultReply(ctx.request.id);
  const json = isJsonType(cfg.enabled ? cfg.contentType : "application/json");
  return {
    kind: "http",
    status: reply.status,
    statusText: STATUS_TEXT[reply.status] ?? "",
    headers: reply.headers,
    body: reply.body,
    isJson: json,
    invalidJson: json && reply.body.trim() !== "" && !parses(reply.body),
  };
}

export function previewToText(p: PreviewResponse): string {
  return [
    `HTTP/1.1 ${p.status} ${p.statusText}`.trim(),
    ...p.headers.map(([k, v]) => `${k}: ${v}`),
    "",
    p.body,
  ].join("\n");
}

export const COMMON_STATUSES = [
  200, 201, 202, 204, 301, 302, 304, 400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503, 504,
];

export const CONTENT_TYPES = [
  "application/json",
  "text/plain",
  "text/html",
  "application/xml",
  "application/x-www-form-urlencoded",
];
