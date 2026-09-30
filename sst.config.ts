/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Inbound on Cloudflare.
 *
 *   App worker  — dashboard (static assets), REST API, capture endpoint,
 *                 queue consumer and cron, all in one script so every part
 *                 can reach the EndpointHub Durable Objects directly.
 *   D1          — endpoints, rules, integrations, delivery log, archive
 *   Durable Obj — one per endpoint: request history (SQLite) + live sockets
 *   Queue       — outbound deliveries with retries and a dead-letter queue
 *   R2          — raw request archive target
 *
 * One stage (`production`, set via SST_STAGE in .env). Local development runs
 * on wrangler/Miniflare instead (apps/worker/wrangler.jsonc), not `sst dev`.
 *
 * INBOUND_DOMAIN=inb.sh serves captures on `inb.sh/<slug>` and the dashboard
 * on `app.inb.sh`. Without it everything runs on workers.dev and captures
 * live at `/h/<slug>`.
 */
export default $config({
  app(input) {
    return {
      name: "inbound",
      home: "cloudflare",
      // single stage; never delete data on `sst remove`
      removal: "retain",
      protect: input?.stage === "production",
      providers: { cloudflare: "6.15.0" },
    };
  },
  async run() {
    const domain = process.env.INBOUND_DOMAIN || undefined;
    const appHost = domain ? `app.${domain}` : undefined;

    const adminPassword = new sst.Secret("AdminPassword");
    const sessionSecret = new sst.Secret("SessionSecret");

    const database = new sst.cloudflare.D1("Database");
    const archive = new sst.cloudflare.Bucket("Archive");
    const deadLetters = new sst.cloudflare.Queue("DeliveriesDlq");
    const deliveries = new sst.cloudflare.Queue("Deliveries");

    const app = new sst.cloudflare.Worker("App", {
      handler: "apps/worker/src/index.ts",
      url: true,
      domain: appHost ? { name: appHost, aliases: [domain!] } : undefined,
      link: [database, archive, deliveries, adminPassword, sessionSecret],
      environment: {
        ...(domain && { CAPTURE_HOST: domain, APP_ORIGIN: `https://${appHost}` }),
        GITHUB_REPO: process.env.INBOUND_GITHUB_REPO ?? "boringContributor/inb.sh",
        DEV: "false",
      },
      compatibility: { date: "2026-09-01", flags: ["nodejs_compat"] },
      assets: {
        directory: "apps/web/dist",
        notFoundHandling: "single-page-application",
        // the worker decides: capture host, /h/*, /api/* and security headers
        runWorkerFirst: true,
      },
      migrations: [{ tag: "v1", newSqliteClasses: ["EndpointHub"] }],
      placement: { mode: "smart" },
      transform: {
        worker: (args) => {
          args.bindings = $resolve([args.bindings]).apply(([bindings]) => [
            ...(bindings ?? []),
            { type: "durable_object_namespace", name: "Hub", className: "EndpointHub" },
          ]);
        },
      },
    });

    // The App worker consumes its own queue so deliveries can write to the
    // same Durable Objects without a second script.
    new cloudflare.QueueConsumer("DeliveriesConsumer", {
      accountId: sst.cloudflare.DEFAULT_ACCOUNT_ID,
      queueId: deliveries.nodes.queue.queueId,
      scriptName: app.nodes.worker.scriptName,
      type: "worker",
      deadLetterQueue: deadLetters.nodes.queue.queueName,
      settings: { batchSize: 10, maxRetries: 5, maxWaitTimeMs: 2000 },
    });

    new cloudflare.WorkersCronTrigger("Cleanup", {
      accountId: sst.cloudflare.DEFAULT_ACCOUNT_ID,
      scriptName: app.nodes.worker.scriptName,
      schedules: [{ cron: "17 * * * *" }],
    });

    return {
      dashboard: appHost ? `https://${appHost}` : app.url,
      capture: domain ? `https://${domain}/<slug>` : $interpolate`${app.url}/h/<slug>`,
    };
  },
});
