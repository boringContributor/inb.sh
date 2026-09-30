import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { HonoEnv } from "./env.ts";
import type { Env } from "./env.ts";
import { api } from "./api.ts";
import { handleCapture } from "./ingest.ts";
import { consumeDeliveries } from "./deliver/consumer.ts";
import { cleanup } from "./cron.ts";
import type { DeliveryJob } from "./deliver/job.ts";

export { EndpointHub } from "./hub.ts";

const app = new Hono<HonoEnv>();

/** `/<slug>/rest/of/path` → capture */
function splitCapturePath(pathname: string): { slug: string; path: string } | null {
  const m = pathname.match(/^\/([a-z0-9][a-z0-9-]{1,46}[a-z0-9])(\/.*)?$/);
  if (!m) return null;
  return { slug: m[1]!, path: m[2] || "/" };
}

// Capture host (e.g. inb.sh): everything is a webhook, nothing else is served.
app.use(async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (c.env.CAPTURE_HOST && host === c.env.CAPTURE_HOST) {
    const parsed = splitCapturePath(new URL(c.req.url).pathname);
    if (!parsed) {
      if (c.env.APP_ORIGIN) return c.redirect(c.env.APP_ORIGIN, 302);
      return c.text("inbound — inbox for HTTP", 200);
    }
    return handleCapture(c.env, c.executionCtx, c.req.raw, parsed.slug, parsed.path);
  }
  await next();
});

// Dashboard host: `/h/<slug>/*` captures too, so a single workers.dev URL works.
app.all("/h/*", (c) => {
  const parsed = splitCapturePath(new URL(c.req.url).pathname.slice(2));
  if (!parsed) return c.json({ error: "unknown endpoint" }, 404);
  return handleCapture(c.env, c.executionCtx, c.req.raw, parsed.slug, parsed.path);
});

app.use("/api/*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));
app.route("/", api);

// SPA: static assets with index.html fallback (configured in sst.config.ts).
app.get("*", async (c) => {
  if (!c.env.ASSETS) return c.text("dashboard assets not deployed", 404);
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(res.headers);
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/assets/")) headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  return new Response(res.body, { status: res.status, headers });
});

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<DeliveryJob>, env: Env) => consumeDeliveries(batch, env),
  scheduled: (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env, DeliveryJob>;
