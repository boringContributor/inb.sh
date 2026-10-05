# Inbound — an inbox for HTTP

Point anything that speaks HTTP at an Inbound URL and watch requests land live. Inspect bodies and
headers, answer with a custom response, route requests through rules and JSONata transforms, fan them
out to Slack, Datadog, R2 and friends, and replay any request to production or `localhost`.

Self-hosted on your own Cloudflare account: one Worker, one D1 database, a Durable Object per endpoint,
a Queue and an R2 bucket. Deployed with [SST](https://sst.dev), built with [Vite+](https://viteplus.dev)
and [HeroUI v3](https://heroui.com).

```
          https://inb.sh/<slug>/…                    https://app.inb.sh
                   │                                         │
┌──────────────────▼─────────────────────────────────────────▼──────────────┐
│ App worker (Hono)                                                         │
│  capture → rules → response ─┐        /api/* (session)   static SPA       │
│                              │ waitUntil                                   │
│         ┌────────────────────▼──────────┐   ┌──────────────┐             │
│         │ EndpointHub DO (per endpoint)  │   │ D1           │             │
│         │  SQLite request history        │   │ endpoints    │             │
│         │  hibernating WebSockets ◀──────┼───│ rules        │             │
│         │  retention alarm               │   │ integrations │             │
│         └────────────────────▲──────────┘   │ deliveries   │             │
│                              │ events        │ archive      │             │
│  queue consumer ◀── Queue ◀──┘ jobs          └──────────────┘             │
│    Slack · Discord · Teams · Datadog · Grafana · PagerDuty · Sentry ·     │
│    Kafka REST · GitHub Actions · Zapier · n8n · HTTP · R2                 │
└───────────────────────────────────────────────────────────────────────────┘
```

## Repository

| Path              | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/web`        | Dashboard — React 19, HeroUI v3, TanStack Router + Query, CodeMirror   |
| `apps/worker`     | Cloudflare Worker — capture, API, Durable Object, queue consumer, cron |
| `packages/shared` | Types, zod schemas, rule conditions, templates, integration catalog    |
| `packages/cli`    | `inbound listen` — tail an endpoint and forward to localhost           |
| `sst.config.ts`   | Infrastructure                                                         |
| `inb-sh.pen`      | The design (open with [pen.dev](https://pen.dev))                      |

## Getting started

Requirements: Node 22+ and pnpm. Nothing else for local development.

```sh
pnpm install
pnpm dev          # worker on :8787 (wrangler/Miniflare), dashboard on http://localhost:5173
```

Everything runs locally: D1, the Durable Objects, the delivery queue and R2 are simulated by
Miniflare and persisted in `.wrangler/state` (`pnpm dev:reset` wipes it). There is no password
locally. Send something:

```sh
curl -X POST http://localhost:8787/h/<slug>/hooks/test -H 'content-type: application/json' -d '{"hello":"inbound"}'
```

Outbound integrations (Slack, Datadog, …) make real HTTP calls. The hourly cleanup cron can be
triggered with `curl "http://localhost:8787/__scheduled?cron=17+*+*+*+*"` when wrangler runs with `--test-scheduled`.

### Deploy

There is a single stage, `production`, deployed from your machine. Copy `.env.example` to `.env` and
fill in the Cloudflare credentials (SST loads it automatically; `SST_STAGE=production` makes every
`sst` command target it). `inb.sh` must be a zone on that Cloudflare account.

```sh
pnpm sst install                                                  # once: generates .sst/platform types
pnpm sst secret set AdminPassword 'a long password'
pnpm sst secret set SessionSecret "$(openssl rand -hex 32)"
pnpm run deploy                                                   # check + test + build, then sst deploy
```

Captures are served on `https://inb.sh/<slug>`, the dashboard on `https://app.inb.sh`. Without
`INBOUND_DOMAIN` everything is served from the worker's `workers.dev` URL with captures at `/h/<slug>`.
CI only runs checks, tests and builds.

## Public and private mode

`INBOUND_MODE` decides who can use an instance.

- **`public`** (what inb.sh runs, and the default): anyone can open the dashboard and get an endpoint
  without signing up. The first endpoint creates an anonymous workspace, remembered by a signed
  cookie, and every endpoint, rule, integration and archived request belongs to a workspace.
- **`private`**: one workspace behind the `AdminPassword`, with no limits. Use it to run your own
  instance for yourself or a team.

Limits per plan live in [`packages/shared/src/plans.ts`](packages/shared/src/plans.ts) and are
enforced by the worker:

|                        | Guest              | Member (planned)       | Self-hosted  |
| ---------------------- | ------------------ | ---------------------- | ------------ |
| Endpoints              | 1                  | 5                      | unlimited    |
| Endpoint lifetime      | 24h after creation | 7 days without traffic | forever      |
| Request history        | 1 day              | 7 days                 | configurable |
| Requests per endpoint  | 1,000 / day        | 10,000 / day           | unlimited    |
| Replays + deliveries   | 100 / day          | 2,000 / day            | unlimited    |
| HTML / proxy responses | no                 | proxy only             | yes          |

A shared capture domain is easy to abuse, so public instances also:

- serve every capture response with `Content-Security-Policy: sandbox`, so nothing on it can run
  as an inb.sh page;
- refuse HTML custom responses and open-relay proxying for guests;
- cap new workspaces per IP and outbound calls per workspace;
- delete expired endpoints and abandoned guest workspaces hourly.

Accounts are next: a workspace already has an optional owner, so signing in (Better Auth with
GitHub) will claim the guest workspace and upgrade it to Member without moving any data.

## Concepts

**Endpoints** get an unguessable slug (`8f2a-9c41-7e3d`) or one you pick. Every method and sub-path is
captured: `POST inb.sh/8f2a-9c41-7e3d/hooks/stripe` shows up as `/hooks/stripe`. Bodies up to 10 MB are
accepted, 1 MB is stored; history is kept per endpoint (default 7 days) in the endpoint's Durable Object.

**Signatures** — configure Stripe, GitHub, Shopify, Slack or generic HMAC-SHA256 verification per
endpoint. The result is shown on each request and usable in rules (`request.signature.verified`).

### Templates

Custom responses in _Template_ mode interpolate `{{ path }}` tokens:

| Token                     | Value                              |
| ------------------------- | ---------------------------------- |
| `{{ request.id }}`        | Unique id of the incoming request  |
| `{{ request.body.* }}`    | Any path in the parsed JSON body   |
| `{{ request.headers.* }}` | Header lookup, case-insensitive    |
| `{{ request.query.* }}`   | Query string parameter             |
| `{{ now.iso8601 }}`       | Server time when the reply is sent |

Inside JSON bodies, `"{{ request.body.data }}"` inlines objects and escapes strings. _Proxy_ mode
forwards to an upstream and relays the real response.

### Rules

Rules run in order on every request. Conditions (`method is POST`, `body.type starts with "invoice."`,
`header stripe-signature is missing`, `response.status is 5xx`) are ANDed. Rules that look at
`response.*` run after the reply is decided. Actions: forward to an integration, respond (first match
wins), replay to a URL (private addresses go through a CLI tunnel), archive, drop.

To test a sender's retries, use `request.attempt`: `request.attempt less than 3` → respond `500`
fails the first try and the first retry, then lets the second retry through. Identical deliveries
are matched by the sender's delivery id (`webhook-id`, `svix-id`, `x-shopify-webhook-id`,
`idempotency-key`) or else by method + path + body. A 2xx reply ends the sequence, so the next
identical send starts at attempt 1. Counters also reset after 24 h without a retry, or when you
clear the inbox. Attempts are only counted while a rule uses them.

### Transforms

Transforms are [JSONata](https://jsonata.org) expressions over `{ method, path, query, headers, body }`.
Return an object with any of those keys to change them, or any other value to replace the body.
Two helpers are available: `$pick(obj, "a", "b")` and `$mask(str)`.

```jsonata
$merge([$, {
  "headers": $merge([headers, {"x-source": "inbound"}]),
  "body": $pick(body, "id", "type", "data")
}])
```

JSONata runs in the worker without `eval`, so transforms can reshape data but never do I/O.

### Integrations

Deliveries go through a Cloudflare Queue with exponential backoff (5 attempts, then the dead-letter
queue). 4xx responses from a destination aren't retried. Postgres and BigQuery are in the catalog but
not deliverable yet.

### CLI tunnel

Forward everything an endpoint receives to a server on your machine:

```sh
npx inb.sh listen <endpoint-id> --to http://localhost:3000 --token <token>
```

Copy the exact command, token included, from the dashboard (endpoint ⋯ menu → **Use from the CLI**).
The token belongs to your workspace; on a private instance use the admin password and pass
`--url https://your-dashboard`. Rules with a "Replay to localhost" action are delivered through the
same tunnel.

## Development

```sh
pnpm vp check          # format, lint, type-check (Oxlint + Oxfmt + tsgo)
pnpm vp run -r test    # Vitest
pnpm vp run -r build
```

## License

MIT
