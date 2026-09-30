import type { CapturedRequest } from "./types.ts";

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const HOP_BY_HOP = new Set([
  "host",
  "content-length",
  "connection",
  "accept-encoding",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "cdn-loop",
]);

export function replayableHeaders(headers: [string, string][]): [string, string][] {
  return headers.filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase()));
}

export function requestToCurl(req: CapturedRequest, baseUrl: string): string {
  const qs = req.query.length ? `?${new URLSearchParams(req.query).toString()}` : "";
  const lines = [`curl -X ${req.method} ${shellQuote(`${baseUrl}${req.path}${qs}`)}`];
  for (const [k, v] of replayableHeaders(req.headers))
    lines.push(`  -H ${shellQuote(`${k}: ${v}`)}`);
  if (req.body && req.bodyEncoding === "utf8") lines.push(`  --data-raw ${shellQuote(req.body)}`);
  return lines.join(" \\\n");
}

export function requestToRaw(req: CapturedRequest): string {
  const qs = req.query.length ? `?${new URLSearchParams(req.query).toString()}` : "";
  const head = [
    `${req.method} ${req.path}${qs} HTTP/1.1`,
    ...req.headers.map(([k, v]) => `${k}: ${v}`),
  ];
  const body =
    req.bodyEncoding === "utf8"
      ? req.body
      : `<${req.size} bytes binary, base64 encoded>\n${req.body}`;
  return `${head.join("\n")}\n\n${body}`;
}

export type SnippetLang = "curl" | "javascript" | "python" | "go";

export function firstRequestSnippet(lang: SnippetLang, url: string): string {
  switch (lang) {
    case "curl":
      return `curl -X POST ${url} \\\n  -H "content-type: application/json" \\\n  -d '{"hello":"inbound"}'`;
    case "javascript":
      return `await fetch("${url}", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify({ hello: "inbound" }),\n});`;
    case "python":
      return `import requests\n\nrequests.post(\n    "${url}",\n    json={"hello": "inbound"},\n)`;
    case "go":
      return `body := strings.NewReader(\`{"hello":"inbound"}\`)\nhttp.Post("${url}", "application/json", body)`;
  }
}
