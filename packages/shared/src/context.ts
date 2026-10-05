/**
 * The shape every rule condition, template variable and transform sees.
 * Built once per request on the server, and from a stored request in the UI
 * (live preview, dry runs), so both sides resolve fields identically.
 */
export interface RequestContext {
  request: {
    id: string;
    method: string;
    path: string;
    url: string;
    query: Record<string, string>;
    /** lower-cased header names */
    headers: Record<string, string>;
    body: unknown;
    rawBody: string;
    ip: string | null;
    country: string | null;
    signature?: { provider: string; verified: boolean } | null;
    /** nth identical delivery (1 = first try); only counted when a rule uses it */
    attempt?: number;
  };
  response?: { status: number };
  endpoint: { id: string; slug: string; name: string };
  now: { iso8601: string; unix: number; ms: number };
}

export function parseBody(raw: string, contentType: string | null | undefined): unknown {
  if (!raw) return null;
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json") || /^\s*[[{]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}

export function nowContext(date = new Date()): RequestContext["now"] {
  return {
    iso8601: date.toISOString(),
    unix: Math.floor(date.getTime() / 1000),
    ms: date.getTime(),
  };
}

/**
 * Resolve a dotted path like `body.data.object.id`, `headers.stripe-signature`,
 * `request.body.type` or `response.status` against the context.
 * Paths without a known root are treated as relative to `request`.
 */
export function resolvePath(ctx: RequestContext, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed) return undefined;
  const segments = splitPath(trimmed);
  if (segments[0] === "header") segments[0] = "headers";
  const rooted = ["request", "response", "endpoint", "now"].includes(segments[0]!);
  let cursor: unknown = rooted ? ctx : ctx.request;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (cursor === null || typeof cursor !== "object") return undefined;
    if (cursor === ctx.request && seg === "headers" && i < segments.length - 1) {
      // header names are case-insensitive and may contain dots
      return ctx.request.headers[
        segments
          .slice(i + 1)
          .join(".")
          .toLowerCase()
      ];
    }
    cursor =
      Array.isArray(cursor) && /^\d+$/.test(seg)
        ? cursor[Number(seg)]
        : (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

function splitPath(path: string): string[] {
  // allow `header stripe-signature` as written in the rules UI
  const normalized = path.replace(/^header\s+/, "header.");
  const out: string[] = [];
  for (const part of normalized.split(".")) {
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      out.push(part);
      continue;
    }
    if (m[1]) out.push(m[1]);
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(idx[1]!);
  }
  return out;
}

/** Rebuild the evaluation context from a stored request (dry runs, live preview). */
export function contextFromCaptured(
  req: {
    id: string;
    method: string;
    path: string;
    query: [string, string][];
    headers: [string, string][];
    body: string;
    bodyEncoding: "utf8" | "base64";
    contentType: string | null;
    ip: string | null;
    country: string | null;
    signature?: { provider: string; verified: boolean } | null;
    attempt?: number;
    status?: number;
  },
  endpoint: { id: string; slug: string; name: string },
  captureBaseUrl = "",
): RequestContext {
  const rawBody = req.bodyEncoding === "utf8" ? req.body : "";
  return {
    request: {
      id: req.id,
      method: req.method,
      path: req.path,
      url: `${captureBaseUrl}${req.path}`,
      query: Object.fromEntries(req.query),
      headers: Object.fromEntries(req.headers.map(([k, v]) => [k.toLowerCase(), v])),
      body: parseBody(rawBody, req.contentType),
      rawBody,
      ip: req.ip,
      country: req.country,
      signature: req.signature ?? null,
      attempt: req.attempt,
    },
    response: req.status ? { status: req.status } : undefined,
    endpoint,
    now: nowContext(),
  };
}
