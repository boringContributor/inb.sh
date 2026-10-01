export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  const pct = ratio * 100;
  return `${pct === 100 ? "100" : pct.toFixed(1)}%`;
}

export const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  410: "Gone",
  413: "Payload Too Large",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function statusLabel(status: number): string {
  return `${status} ${STATUS_TEXT[status] ?? ""}`.trim();
}

export type Tone = "success" | "warning" | "danger" | "accent" | "default";

export function statusTone(status: number): Tone {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 300) return "accent";
  if (status >= 200) return "success";
  return "default";
}

export function methodTone(method: string): Tone {
  switch (method.toUpperCase()) {
    case "POST":
      return "success";
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "accent";
    case "PUT":
    case "PATCH":
      return "warning";
    case "DELETE":
      return "danger";
    default:
      return "default";
  }
}

/** "in 23h", "in 6d", "in 12m", or "now" for an ISO time in the future. */
export function formatUntil(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return "now";
  if (s < 3600) return `in ${Math.max(1, Math.floor(s / 60))}m`;
  // hours up to two days, so a fresh 24h endpoint reads "in 23h", not "in 1d"
  if (s < 2 * 86400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86400)}d`;
}
