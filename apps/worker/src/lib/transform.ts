import jsonata from "jsonata";

export interface TransformInput {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface TransformOutput {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

const TIMEOUT_MS = 1000;
const cache = new Map<string, jsonata.Expression>();

const pick = (obj: unknown, ...keys: string[]) => {
  if (!obj || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]));
};

const mask = (value: unknown) => {
  if (typeof value !== "string") return value;
  return value.length <= 4 ? "••••" : "•".repeat(value.length - 4) + value.slice(-4);
};

function compile(source: string): jsonata.Expression {
  let expr = cache.get(source);
  if (!expr) {
    expr = jsonata(source);
    expr.registerFunction("pick", pick, "<os+:o>");
    expr.registerFunction("mask", mask, "<x:x>");
    if (cache.size > 200) cache.clear();
    cache.set(source, expr);
  }
  return expr;
}

/**
 * Transforms are JSONata expressions evaluated against the request.
 * Workers can't `eval`, and JSONata is an interpreter with no I/O, so user
 * code can only reshape data. Runaway expressions are cut off by the
 * timeout here and by the Worker CPU limit.
 *
 * If the result has any of `method/path/headers/body` it is merged over the
 * request; otherwise the result replaces the body.
 */
export async function runTransform(source: string, input: TransformInput): Promise<TransformOutput> {
  const expr = compile(source);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const result = (await Promise.race([
    expr.evaluate(input),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`transform exceeded ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
    }),
  ]).finally(() => timer !== null && clearTimeout(timer))) as unknown;

  if (result && typeof result === "object" && !Array.isArray(result)) {
    const r = result as Partial<TransformOutput>;
    if ("headers" in r || "body" in r || "method" in r || "path" in r) {
      return {
        method: typeof r.method === "string" ? r.method.toUpperCase() : input.method,
        path: typeof r.path === "string" ? r.path : input.path,
        headers: normalizeHeaders(r.headers ?? input.headers),
        body: "body" in r ? r.body : input.body,
      };
    }
  }
  return { method: input.method, path: input.path, headers: input.headers, body: result };
}

export function validateTransform(source: string): string | null {
  try {
    jsonata(source);
    return null;
  } catch (err) {
    return (err as { message?: string }).message ?? String(err);
  }
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k.toLowerCase(), typeof v === "string" ? v : JSON.stringify(v)]),
  );
}
