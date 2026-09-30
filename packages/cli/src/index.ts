/**
 * inbound — tail an endpoint and forward every request to a local server.
 *
 *   INBOUND_URL=https://app.inb.sh INBOUND_TOKEN=<admin password> \
 *     inbound listen <endpoint-id> --to http://localhost:4000
 *
 * Opens two sockets to the endpoint's hub:
 *   ui      — every new request; with --to it's fetched and forwarded
 *   tunnel  — rule "Replay to localhost" actions, answered with a result
 */
import { parseArgs } from "node:util";

interface Summary {
  id: string;
  method: string;
  path: string;
  status: number;
  summary: string;
  receivedAt: string;
}

interface Captured extends Summary {
  query: [string, string][];
  headers: [string, string][];
  body: string;
  bodyEncoding: "utf8" | "base64";
}

const HOP = new Set([
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

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const statusColor = (s: number | null) =>
  s === null ? c.red : s >= 500 ? c.red : s >= 400 ? c.yellow : c.green;

function usage(code = 0): never {
  console.log(`usage: inbound listen <endpoint-id> [--to http://localhost:4000] [--url https://app.inb.sh] [--token …]

  --to      forward every captured request to this base URL
  --url     dashboard origin (env INBOUND_URL)
  --token   admin password (env INBOUND_TOKEN)
  --json    print one JSON line per request`);
  process.exit(code);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    to: { type: "string" },
    url: { type: "string", default: process.env.INBOUND_URL },
    token: { type: "string", default: process.env.INBOUND_TOKEN },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) usage();
const [command, endpointId] = positionals;
if (command !== "listen" && command !== "tail") usage(1);
if (!endpointId || !values.url || !values.token) usage(1);

const origin = values.url.replace(/\/$/, "");
const auth = { authorization: `Bearer ${values.token}` };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${origin}/api${path}`, {
    ...init,
    headers: { ...auth, "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function forward(
  req: Captured,
  base: string,
): Promise<{ status: number | null; durationMs: number; error?: string }> {
  const qs = req.query.length ? `?${new URLSearchParams(req.query)}` : "";
  const url = `${base.replace(/\/$/, "")}${req.path}${qs}`;
  const started = performance.now();
  try {
    const body = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : req.bodyEncoding === "base64"
        ? Buffer.from(req.body, "base64")
        : req.body;
    const res = await fetch(url, {
      method: req.method,
      headers: req.headers.filter(([k]) => !HOP.has(k.toLowerCase())),
      body,
      redirect: "manual",
    });
    await res.arrayBuffer();
    return { status: res.status, durationMs: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      status: null,
      durationMs: Math.round(performance.now() - started),
      error: (err as Error).message,
    };
  }
}

function socket(
  role: "ui" | "tunnel",
  onMessage: (msg: Record<string, unknown>, ws: WebSocket) => void,
) {
  const wsUrl = `${origin.replace(/^http/, "ws")}/api/endpoints/${endpointId}/live?role=${role}`;
  let retry = 0;
  const connect = () => {
    // Node's WebSocket (undici) accepts headers as a non-standard init option
    const ws = new WebSocket(wsUrl, { headers: auth } as unknown as string[]);
    let ping: NodeJS.Timeout | undefined;
    ws.addEventListener("open", () => {
      retry = 0;
      ping = setInterval(() => ws.send("ping"), 25_000);
      if (role === "ui")
        console.error(c.dim(`● listening on ${endpointId}${values.to ? ` → ${values.to}` : ""}`));
    });
    ws.addEventListener("message", (ev) => {
      if (ev.data === "pong") return;
      onMessage(JSON.parse(String(ev.data)) as Record<string, unknown>, ws);
    });
    ws.addEventListener("close", () => {
      clearInterval(ping);
      const delay = Math.min(15_000, 500 * 2 ** retry++);
      if (role === "ui")
        console.error(c.dim(`○ disconnected, retrying in ${Math.round(delay / 1000)}s`));
      setTimeout(connect, delay);
    });
    ws.addEventListener("error", () => ws.close());
  };
  connect();
}

socket("ui", async (msg) => {
  if (msg.type !== "request") return;
  const r = msg.request as Summary;
  if (values.json) {
    console.log(JSON.stringify(r));
  } else {
    const time = new Date(r.receivedAt).toLocaleTimeString();
    console.log(
      `${c.dim(time)} ${c.bold(r.method.padEnd(6))} ${r.path} ${statusColor(r.status)(String(r.status))} ${c.dim(r.summary)}`,
    );
  }
  if (!values.to) return;
  const full = await api<Captured>(`/endpoints/${endpointId}/requests/${r.id}`);
  const result = await forward(full, values.to);
  const label = result.error ?? String(result.status);
  console.log(
    `  ${c.blue("↳")} ${values.to}${full.path} ${statusColor(result.status)(label)} ${c.dim(`${result.durationMs} ms`)}`,
  );
  await api(`/endpoints/${endpointId}/requests/${r.id}/replayed`, {
    method: "POST",
    body: JSON.stringify({ url: values.to, status: result.status }),
  }).catch(() => {});
});

socket("tunnel", async (msg, ws) => {
  if (msg.type !== "forward") return;
  const req = msg.request as Captured;
  const target = String(msg.url);
  const result = await forward(req, target);
  console.log(
    `  ${c.blue("⇢")} rule replay ${target}${req.path} ${statusColor(result.status)(result.error ?? String(result.status))}`,
  );
  ws.send(JSON.stringify({ type: "forward_result", requestId: req.id, url: target, ...result }));
});

process.on("SIGINT", () => process.exit(0));
