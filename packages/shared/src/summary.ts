/**
 * Pick a human label for a request: webhook event names first, then a
 * readable fallback derived from method + path.
 */
export function summarizeRequest(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}): string {
  const h = input.headers;
  const fromHeader =
    h["x-github-event"] ?? h["x-shopify-topic"] ?? h["x-event-type"] ?? h["x-webhook-event"];
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const b = input.body as Record<string, unknown>;
    for (const key of ["type", "event", "event_type", "eventType", "topic"]) {
      if (typeof b[key] === "string" && b[key]) return b[key];
    }
    if (fromHeader && typeof b.action === "string") return `${fromHeader}.${b.action}`;
  }
  if (fromHeader) return fromHeader;
  const path = input.path === "/" ? "" : input.path;
  if (input.method === "GET" && /health|ping|status/i.test(path)) return "health check";
  return `${input.method.toLowerCase()} ${path || "/"}`;
}
