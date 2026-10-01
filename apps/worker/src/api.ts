import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type AppConfig,
  type CapturedRequest,
  type DryRunResult,
  type PipelineStats,
  type Plan,
  type RequestSummary,
  type ResponseConfig,
  type RuleAction,
  DEFAULT_RESPONSE,
  contextFromCaptured,
  createEndpointSchema,
  evaluateCondition,
  integrationDefinition,
  integrationInputSchema,
  replayableHeaders,
  requestFilterSchema,
  ruleInputSchema,
  ruleUpdateSchema,
  integrationUpdateSchema,
  isHtmlContentType,
  updateEndpointSchema,
} from "@inb/shared";
import { type Env, type HonoEnv, type WaitUntil, secret } from "./env.ts";
import {
  findEndpoint,
  getDb,
  getSetting,
  listEndpoints,
  listIntegrations,
  mergeConfig,
  recentDeliveries,
  schema,
  setSetting,
  toEndpoint,
  toRule,
} from "./db/repo.ts";
import { checkPassword, clearSession, issueSession } from "./lib/auth.ts";
import {
  type WorkspaceRow,
  consumeOutbound,
  endpointExpiry,
  ensureWorkspace,
  planLimit,
  requirePrivateAuth,
  resolveWorkspace,
  workspaceToken,
} from "./lib/workspace.ts";
import { deliveryId, endpointId, endpointSlug, integrationId, ruleId } from "./lib/ids.ts";
import { type TransformOutput, runTransform, validateTransform } from "./lib/transform.ts";
import { forward, send } from "./deliver/send.ts";
import { isPrivateUrl } from "./ingest.ts";

type App = HonoEnv;

export function captureBaseUrl(env: Env, requestUrl: string): string {
  if (env.CAPTURE_HOST) return `https://${env.CAPTURE_HOST}`;
  return `${new URL(requestUrl).origin}/h`;
}

const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HTTPException(422, {
      res: Response.json(
        { error: "validation_failed", issues: z.treeifyError(result.error) },
        { status: 422 },
      ),
    });
  }
  return result.data;
};

const notFound = (what: string) =>
  new HTTPException(404, { res: Response.json({ error: `${what} not found` }, { status: 404 }) });

export const api = new Hono<App>().basePath("/api");

api.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error("api error", { path: c.req.path, err: String(err), stack: (err as Error).stack });
  return c.json({ error: "internal_error" }, 500);
});

api.use(async (c, next) => {
  c.set("db", await getDb(c.env.Database));
  await next();
});
api.use(resolveWorkspace);

type Ctx = Context<HonoEnv>;

/** The caller's workspace, or a 404 for guests who don't have one yet. */
function workspaceOf(c: Ctx): WorkspaceRow {
  const ws = c.get("workspace");
  if (!ws) throw notFound("workspace");
  return ws;
}

const wsId = (c: Ctx) => c.get("workspace")?.id ?? null;

/** Responses served on the shared capture domain must not become phishing pages. */
function checkResponseConfig(plan: Plan, response: ResponseConfig) {
  const types = [
    response.contentType,
    ...response.headers.filter((h) => h.key.toLowerCase() === "content-type").map((h) => h.value),
  ];
  if (!plan.allowHtmlResponses && types.some(isHtmlContentType)) {
    throw planLimit(
      "html_responses",
      "HTML responses aren't available on this plan. Use JSON or plain text.",
    );
  }
  if (!plan.allowProxy && response.enabled && response.mode === "proxy") {
    throw planLimit("proxy", "Proxy mode isn't available on this plan.");
  }
}

async function checkRuleActions(c: Ctx, plan: Plan, actions: RuleAction[] | undefined) {
  if (!actions) return;
  for (const action of actions) {
    if (
      action.type === "respond" &&
      !plan.allowHtmlResponses &&
      isHtmlContentType(action.contentType)
    ) {
      throw planLimit(
        "html_responses",
        "HTML responses aren't available on this plan. Use JSON or plain text.",
      );
    }
    if (action.type === "forward") {
      const owned = await c.get("db").query.integrations.findFirst({
        where: and(
          eq(schema.integrations.id, action.integrationId),
          eq(schema.integrations.workspaceId, workspaceOf(c).id),
        ),
      });
      if (!owned) throw notFound("integration");
    }
  }
}

/* --------------------------------- public --------------------------------- */

api.get("/health", (c) => c.json({ ok: true }));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

api.get("/config", async (c) => {
  const db = c.get("db");
  const mode = c.get("mode");
  const workspace = c.get("workspace");
  const plan = c.get("plan");
  const repo = c.env.GITHUB_REPO ?? "boringContributor/inb.sh";
  let user: AppConfig["user"] = null;
  if (mode === "private" && workspace) {
    const name = (await getSetting(db, "userName")) ?? "Admin";
    user = { name, initials: initials(name), plan: plan.label };
  } else if (mode === "public") {
    user = { name: "Guest", initials: "G", plan: workspace ? plan.label : "No workspace yet" };
  }
  const config: AppConfig = {
    mode,
    captureBaseUrl: captureBaseUrl(c.env, c.req.url),
    workspaceName: workspace?.name ?? "inb.sh",
    user,
    workspace: workspace
      ? { id: workspace.id, createdAt: workspace.createdAt.toISOString() }
      : null,
    plan,
    accounts: false,
    githubRepo: repo,
    githubStars: await githubStars(repo, c.executionCtx),
  };
  return c.json(config);
});

api.post("/auth/login", async (c) => {
  if (c.get("mode") !== "private") return c.json({ error: "not_found" }, 404);
  const { password } = parse(z.object({ password: z.string().min(1) }), await c.req.json());
  if (!secret(c.env, "AdminPassword"))
    return c.json({ error: "AdminPassword secret is not set" }, 503);
  if (!checkPassword(c.env, password)) {
    await new Promise((r) => setTimeout(r, 400));
    return c.json({ error: "invalid_password" }, 401);
  }
  await issueSession(c);
  return c.json({ ok: true });
});

api.post("/auth/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

/* ------------------------------ authenticated ----------------------------- */

api.use("*", requirePrivateAuth);

const hub = (env: Env, id: string) => env.Hub.get(env.Hub.idFromName(id));

/** Token for `inbound listen`. Private instances use the admin password instead. */
api.get("/cli-token", async (c) => {
  if (c.get("mode") === "private") return c.json({ token: null });
  const workspace = workspaceOf(c);
  return c.json({ token: await workspaceToken(c.env, workspace.id) });
});

/** RPC serialization widens tuples (`[string, string][]` → `string[][]`); the shape is unchanged. */
const asCaptured = (req: unknown) => req as CapturedRequest | null;

async function requireEndpoint(c: Ctx, id: string) {
  const ws = wsId(c);
  const row = ws ? await findEndpoint(c.get("db"), ws, id) : undefined;
  if (!row) throw notFound("endpoint");
  return row;
}

api.get("/endpoints", async (c) => {
  const ws = wsId(c);
  const rows = ws ? await listEndpoints(c.get("db"), ws) : [];
  return c.json(rows.map((r) => toEndpoint(r, c.get("plan"))));
});

api.post("/endpoints", async (c) => {
  const db = c.get("db");
  const input = parse(createEndpointSchema, await c.req.json());
  const workspace = await ensureWorkspace(c);
  const plan = c.get("plan");
  if (plan.maxEndpoints !== null) {
    const count = (await listEndpoints(db, workspace.id)).length;
    if (count >= plan.maxEndpoints) {
      throw planLimit(
        "endpoints",
        plan.maxEndpoints === 1
          ? "Guests get one endpoint at a time. Delete it to create a new one."
          : `This plan allows ${plan.maxEndpoints} endpoints.`,
      );
    }
  }
  if (input.slug && !plan.customSlugs)
    throw planLimit("custom_slugs", "Custom paths aren't available on this plan.");
  const slug = input.slug ?? endpointSlug();
  const taken = await db.query.endpoints.findFirst({ where: eq(schema.endpoints.slug, slug) });
  if (taken) return c.json({ error: "slug_taken" }, 409);
  const now = new Date();
  const [row] = await db
    .insert(schema.endpoints)
    .values({
      id: endpointId(),
      workspaceId: workspace.id,
      slug,
      name: input.name,
      icon: input.icon,
      retentionDays: plan.retentionDays,
      response: DEFAULT_RESPONSE,
      expiresAt: endpointExpiry(plan, now, now),
      createdAt: now,
    })
    .returning();
  await hub(c.env, row!.id).setRetention(plan.retentionDays);
  return c.json(toEndpoint(row!, plan), 201);
});

api.get("/endpoints/:id", async (c) =>
  c.json(toEndpoint(await requireEndpoint(c, c.req.param("id")), c.get("plan"))),
);

api.patch("/endpoints/:id", async (c) => {
  const db = c.get("db");
  const plan = c.get("plan");
  const existing = await requireEndpoint(c, c.req.param("id"));
  const input = parse(updateEndpointSchema, await c.req.json());
  if (input.response) checkResponseConfig(plan, input.response);
  if (input.retentionDays !== undefined && !plan.configurableRetention) {
    throw planLimit("retention", `History is kept for ${plan.retentionDays} day(s) on this plan.`);
  }
  let signing = existing.signing;
  if (input.signing === null) signing = null;
  else if (input.signing) {
    const secretValue = input.signing.secret ?? existing.signing?.secret;
    if (!secretValue)
      return c.json({ error: "missing_secret", message: "A signing secret is required" }, 422);
    signing = { ...input.signing, secret: secretValue };
  }
  const [row] = await db
    .update(schema.endpoints)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.retentionDays !== undefined && { retentionDays: input.retentionDays }),
      ...(input.response !== undefined && { response: input.response }),
      ...(input.signing !== undefined && { signing }),
    })
    .where(eq(schema.endpoints.id, existing.id))
    .returning();
  if (input.retentionDays !== undefined)
    await hub(c.env, existing.id).setRetention(input.retentionDays);
  return c.json(toEndpoint(row!, plan));
});

api.delete("/endpoints/:id", async (c) => {
  const db = c.get("db");
  const existing = await requireEndpoint(c, c.req.param("id"));
  await db
    .update(schema.endpoints)
    .set({ deletedAt: new Date() })
    .where(eq(schema.endpoints.id, existing.id));
  await hub(c.env, existing.id).destroy();
  return c.json({ ok: true });
});

api.get("/endpoints/:id/requests", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  const q = c.req.query();
  const page = await hub(c.env, endpoint.id).list({
    filter: requestFilterSchema.catch("all").parse(q.filter),
    q: q.q,
    cursor: q.cursor ?? null,
    limit: Math.min(100, Math.max(1, Number(q.limit) || 50)),
    order: q.order === "asc" ? "asc" : "desc",
  });
  return c.json(page);
});

api.delete("/endpoints/:id/requests", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  await hub(c.env, endpoint.id).clear();
  return c.json({ ok: true });
});

async function requireRequest(
  env: Env,
  endpointId: string,
  requestId: string,
): Promise<CapturedRequest> {
  const req = asCaptured(await hub(env, endpointId).get(requestId));
  if (!req) throw notFound("request");
  return req;
}

api.get("/endpoints/:id/requests/:rid", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  return c.json(await requireRequest(c.env, endpoint.id, c.req.param("rid")));
});

api.get("/endpoints/:id/requests/:rid/deliveries", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  const rows = await recentDeliveries(c.get("db"), endpoint.workspaceId, {
    requestId: c.req.param("rid"),
    limit: 50,
  });
  return c.json(rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })));
});

const replaySchema = z.object({
  url: z.string().url(),
  transform: z
    .string()
    .max(32 * 1024)
    .optional(),
});

api.post("/endpoints/:id/requests/:rid/replay", async (c) => {
  const db = c.get("db");
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  const original = await requireRequest(c.env, endpoint.id, c.req.param("rid"));
  const input = parse(replaySchema, await c.req.json());
  if (isPrivateUrl(input.url)) {
    return c.json(
      {
        error: "private_url",
        message: "Private addresses are replayed from your browser or a CLI tunnel.",
      },
      400,
    );
  }
  const ctx = contextFromCaptured(original, endpoint);
  let payload: TransformOutput = {
    method: original.method,
    path: original.path,
    headers: Object.fromEntries(replayableHeaders(original.headers)),
    body: original.bodyEncoding === "utf8" ? (ctx.request.body ?? original.body) : null,
  };
  if (input.transform?.trim()) {
    try {
      payload = await runTransform(input.transform, { ...payload, query: ctx.request.query });
    } catch (err) {
      return c.json(
        { error: "transform_failed", message: String((err as Error).message ?? err) },
        422,
      );
    }
  }
  if (!(await consumeOutbound(db, endpoint.workspaceId, c.get("plan")))) {
    throw planLimit(
      "outbound",
      "Daily replay and delivery limit reached. It resets at midnight UTC.",
      429,
    );
  }
  const target = new URL(input.url);
  const result = await forward(target.toString(), payload);
  await hub(c.env, endpoint.id).markReplayed(original.id, {
    type: "replayed",
    at: new Date().toISOString(),
    label: `Replayed ${original.replayCount + 1}×`,
    detail: `to ${target.host}${target.pathname === "/" ? "" : target.pathname} · ${result.status ?? "error"}`,
  });
  return c.json(result);
});

/** Browser-side replays (localhost) report back so the timeline stays complete. */
api.post("/endpoints/:id/requests/:rid/replayed", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  const original = await requireRequest(c.env, endpoint.id, c.req.param("rid"));
  const input = parse(
    z.object({ url: z.string(), status: z.number().nullable() }),
    await c.req.json(),
  );
  const target = new URL(input.url);
  const summary = await hub(c.env, endpoint.id).markReplayed(original.id, {
    type: "replayed",
    at: new Date().toISOString(),
    label: `Replayed ${original.replayCount + 1}×`,
    detail: `to ${target.host} · ${input.status ?? "error"}`,
  });
  return c.json(summary);
});

api.post("/endpoints/:id/requests/:rid/archive", async (c) => {
  const db = c.get("db");
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  const req = await requireRequest(c.env, endpoint.id, c.req.param("rid"));
  await db
    .insert(schema.archived)
    .values({
      id: req.id,
      workspaceId: endpoint.workspaceId,
      endpointId: endpoint.id,
      data: req,
      method: req.method,
      path: req.path,
      status: req.status,
      summary: req.summary,
      size: req.size,
      receivedAt: new Date(req.receivedAt),
      archivedAt: new Date(),
    })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

/** WebSocket: live request stream for the dashboard (`role=ui`) or CLI (`role=tunnel`). */
api.get("/endpoints/:id/live", async (c) => {
  const endpoint = await requireEndpoint(c, c.req.param("id"));
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
    return c.json({ error: "expected websocket" }, 426);
  return hub(c.env, endpoint.id).fetch(c.req.raw);
});

/* ---------------------------------- rules --------------------------------- */

api.get("/rules", async (c) => {
  const ws = wsId(c);
  const rows = ws
    ? await c.get("db").query.rules.findMany({
        where: eq(schema.rules.workspaceId, ws),
        orderBy: asc(schema.rules.position),
      })
    : [];
  return c.json(rows.map(toRule));
});

const ownRule = (c: Ctx, id: string) =>
  and(eq(schema.rules.id, id), eq(schema.rules.workspaceId, workspaceOf(c).id));

function checkRule(input: { transform?: string | null }) {
  if (input.transform?.trim()) {
    const error = validateTransform(input.transform);
    if (error) {
      throw new HTTPException(422, {
        res: Response.json({ error: "invalid_transform", message: error }, { status: 422 }),
      });
    }
  }
}

api.post("/rules", async (c) => {
  const db = c.get("db");
  const input = parse(ruleInputSchema, await c.req.json());
  checkRule(input);
  const workspace = await ensureWorkspace(c);
  const plan = c.get("plan");
  await checkRuleActions(c, plan, input.actions);
  if (input.endpointId) await requireEndpoint(c, input.endpointId);
  const existing = await db.query.rules.findMany({
    where: eq(schema.rules.workspaceId, workspace.id),
  });
  if (plan.maxRules !== null && existing.length >= plan.maxRules) {
    throw planLimit("rules", `This plan allows ${plan.maxRules} rules.`);
  }
  const last = existing.reduce((max, r) => Math.max(max, r.position), 0);
  const now = new Date();
  const [row] = await db
    .insert(schema.rules)
    .values({
      id: ruleId(),
      workspaceId: workspace.id,
      ...input,
      position: last + 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return c.json(toRule(row!), 201);
});

api.patch("/rules/:id", async (c) => {
  const db = c.get("db");
  const input = parse(ruleUpdateSchema, await c.req.json());
  checkRule(input);
  await checkRuleActions(c, c.get("plan"), input.actions);
  if (input.endpointId) await requireEndpoint(c, input.endpointId);
  const [row] = await db
    .update(schema.rules)
    .set({ ...input, updatedAt: new Date() })
    .where(ownRule(c, c.req.param("id")))
    .returning();
  if (!row) throw notFound("rule");
  return c.json(toRule(row));
});

api.delete("/rules/:id", async (c) => {
  await c
    .get("db")
    .delete(schema.rules)
    .where(ownRule(c, c.req.param("id")));
  return c.json({ ok: true });
});

api.post("/rules/reorder", async (c) => {
  const db = c.get("db");
  const { ids } = parse(z.object({ ids: z.array(z.string()).max(500) }), await c.req.json());
  if (ids.length) {
    const [first, ...rest] = ids.map((id, i) =>
      db
        .update(schema.rules)
        .set({ position: i + 1 })
        .where(ownRule(c, id)),
    );
    await db.batch([first!, ...rest]);
  }
  return c.json({ ok: true });
});

api.post("/rules/dry-run", async (c) => {
  const db = c.get("db");
  const input = parse(
    z.object({
      rule: ruleInputSchema,
      endpointId: z.string().optional(),
      requestId: z.string().optional(),
    }),
    await c.req.json(),
  );
  const ws = wsId(c);
  const endpoints = ws ? await listEndpoints(db, ws) : [];
  const endpoint =
    endpoints.find((e) => e.id === (input.endpointId ?? input.rule.endpointId)) ??
    [...endpoints].sort(
      (a, b) => (b.lastRequestAt?.getTime() ?? 0) - (a.lastRequestAt?.getTime() ?? 0),
    )[0];
  const request = asCaptured(
    endpoint
      ? input.requestId
        ? await hub(c.env, endpoint.id).get(input.requestId)
        : await hub(c.env, endpoint.id).latest()
      : null,
  );

  const result: DryRunResult = {
    requestId: request?.id ?? null,
    matched: false,
    conditions: [],
    transformed: null,
    transformError: null,
    actions: [],
  };
  if (!request || !endpoint) return c.json(result);

  const ctx = contextFromCaptured(request, endpoint);
  result.conditions = input.rule.conditions.map((condition) => ({
    condition,
    ...evaluateCondition(ctx, condition),
  }));
  result.matched = result.conditions.every((r) => r.passed);
  if (input.rule.transform?.trim()) {
    try {
      const out = await runTransform(input.rule.transform, {
        method: request.method,
        path: request.path,
        query: ctx.request.query,
        headers: ctx.request.headers,
        body: ctx.request.body,
      });
      result.transformed = { headers: out.headers, body: out.body };
    } catch (err) {
      result.transformError = String((err as Error).message ?? err);
    }
  }
  const integrations = await db.query.integrations.findMany({
    where: eq(schema.integrations.workspaceId, endpoint.workspaceId),
  });
  result.actions = input.rule.actions.map((action) => {
    switch (action.type) {
      case "forward": {
        const i = integrations.find((x) => x.id === action.integrationId);
        return {
          action,
          description: i ? `Forward to ${i.name}` : "Forward to a missing integration",
        };
      }
      case "respond":
        return { action, description: `Respond ${action.status}` };
      case "replay":
        return { action, description: `Replay to ${action.url}` };
      case "archive":
        return { action, description: "Archive the request" };
      case "drop":
        return { action, description: "Drop the request" };
    }
  });
  return c.json(result);
});

api.get("/pipeline", async (c) => {
  const db = c.get("db");
  const ws = wsId(c) ?? "";
  const [endpoints, rules, integrations] = await Promise.all([
    listEndpoints(db, ws),
    db.query.rules.findMany({ where: eq(schema.rules.workspaceId, ws) }),
    db.query.integrations.findMany({
      where: and(eq(schema.integrations.workspaceId, ws), eq(schema.integrations.enabled, true)),
    }),
  ]);
  const stats = await Promise.all(endpoints.map((e) => hub(c.env, e.id).stats()));
  const withAvg = stats.filter((s) => s.avgResponseMs !== null);
  const pipeline: PipelineStats = {
    receivedToday: stats.reduce((n, s) => n + s.today, 0),
    rules: rules.length,
    activeTransforms: rules.filter((r) => r.enabled && r.transform?.trim()).length,
    customResponses: endpoints.filter((e) => e.response.enabled).length,
    avgResponseMs: withAvg.length
      ? Math.round(withAvg.reduce((n, s) => n + s.avgResponseMs!, 0) / withAvg.length)
      : null,
    integrations: integrations.length,
  };
  return c.json(pipeline);
});

/* ------------------------------ integrations ------------------------------ */

api.get("/integrations", async (c) => {
  const ws = wsId(c);
  return c.json(ws ? await listIntegrations(c.get("db"), ws) : []);
});

const ownIntegration = (c: Ctx, id: string) =>
  and(eq(schema.integrations.id, id), eq(schema.integrations.workspaceId, workspaceOf(c).id));

api.post("/integrations", async (c) => {
  const db = c.get("db");
  const input = parse(integrationInputSchema, await c.req.json());
  const def = integrationDefinition(input.kind);
  const missing = def.fields.filter((f) => !f.optional && !input.config[f.key]?.trim());
  if (missing.length)
    return c.json({ error: "missing_fields", fields: missing.map((f) => f.key) }, 422);
  const workspace = await ensureWorkspace(c);
  const plan = c.get("plan");
  if (plan.maxIntegrations !== null) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.integrations)
      .where(eq(schema.integrations.workspaceId, workspace.id));
    if ((row?.n ?? 0) >= plan.maxIntegrations) {
      throw planLimit("integrations", `This plan allows ${plan.maxIntegrations} integration(s).`);
    }
  }
  const id = integrationId();
  await db
    .insert(schema.integrations)
    .values({ id, workspaceId: workspace.id, ...input, createdAt: new Date() });
  return c.json(
    (await listIntegrations(db, workspace.id)).find((i) => i.id === id),
    201,
  );
});

api.patch("/integrations/:id", async (c) => {
  const db = c.get("db");
  const existing = await db.query.integrations.findFirst({
    where: ownIntegration(c, c.req.param("id")),
  });
  if (!existing) throw notFound("integration");
  const input = parse(integrationUpdateSchema, await c.req.json());
  await db
    .update(schema.integrations)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.config !== undefined && { config: mergeConfig(existing.config, input.config) }),
    })
    .where(eq(schema.integrations.id, existing.id));
  return c.json(
    (await listIntegrations(db, existing.workspaceId)).find((i) => i.id === existing.id),
  );
});

api.delete("/integrations/:id", async (c) => {
  await c
    .get("db")
    .delete(schema.integrations)
    .where(ownIntegration(c, c.req.param("id")));
  return c.json({ ok: true });
});

api.post("/integrations/:id/test", async (c) => {
  const db = c.get("db");
  const integration = await db.query.integrations.findFirst({
    where: ownIntegration(c, c.req.param("id")),
  });
  if (!integration) throw notFound("integration");
  if (!(await consumeOutbound(db, integration.workspaceId, c.get("plan")))) {
    throw planLimit(
      "outbound",
      "Daily replay and delivery limit reached. It resets at midnight UTC.",
      429,
    );
  }
  const now = new Date().toISOString();
  const result = await send(
    integration.kind,
    integration.config,
    {
      workspaceId: integration.workspaceId,
      requestId: "req_test",
      endpointId: "ep_test",
      endpointName: "Test delivery",
      endpointSlug: "test",
      status: 200,
      summary: "inbound.test",
      receivedAt: now,
    },
    {
      method: "POST",
      path: "/test",
      headers: { "content-type": "application/json" },
      body: { type: "inbound.test", at: now },
    },
    c.env.Archive,
  );
  await db.insert(schema.deliveries).values({
    id: deliveryId(),
    workspaceId: integration.workspaceId,
    integrationId: integration.id,
    requestId: "req_test",
    endpointId: "ep_test",
    ruleId: null,
    status: result.status,
    ok: result.ok,
    attempts: 1,
    durationMs: result.durationMs,
    error: result.error,
    createdAt: new Date(),
  });
  return c.json(result);
});

api.get("/deliveries", async (c) => {
  const ws = wsId(c);
  if (!ws) return c.json([]);
  const rows = await recentDeliveries(c.get("db"), ws, {
    integrationId: c.req.query("integrationId"),
    limit: Math.min(200, Number(c.req.query("limit")) || 50),
  });
  return c.json(rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })));
});

/* --------------------------------- archive -------------------------------- */

api.get("/archive", async (c) => {
  const db = c.get("db");
  const before = c.req.query("before");
  const ws = wsId(c);
  if (!ws) return c.json([]);
  const rows = await db.query.archived.findMany({
    columns: { data: false },
    where: and(
      eq(schema.archived.workspaceId, ws),
      before ? lt(schema.archived.archivedAt, new Date(Number(before))) : undefined,
    ),
    orderBy: desc(schema.archived.archivedAt),
    limit: 100,
  });
  const items: (RequestSummary & { archivedAt: string })[] = rows.map((r) => ({
    id: r.id,
    endpointId: r.endpointId,
    method: r.method,
    path: r.path,
    status: r.status,
    size: r.size,
    contentType: null,
    summary: r.summary,
    receivedAt: r.receivedAt.toISOString(),
    replayCount: 0,
    archivedAt: r.archivedAt.toISOString(),
  }));
  return c.json(items);
});

api.get("/archive/:rid", async (c) => {
  const row = await c.get("db").query.archived.findFirst({
    where: and(
      eq(schema.archived.id, c.req.param("rid")),
      eq(schema.archived.workspaceId, wsId(c) ?? ""),
    ),
  });
  if (!row) throw notFound("archived request");
  return c.json(row.data);
});

api.delete("/archive/:rid", async (c) => {
  await c
    .get("db")
    .delete(schema.archived)
    .where(
      and(
        eq(schema.archived.id, c.req.param("rid")),
        eq(schema.archived.workspaceId, wsId(c) ?? ""),
      ),
    );
  return c.json({ ok: true });
});

/* -------------------------------- settings -------------------------------- */

api.get("/settings", async (c) => {
  const db = c.get("db");
  return c.json({
    workspaceName: c.get("workspace")?.name ?? "inb.sh",
    userName:
      c.get("mode") === "private" ? ((await getSetting(db, "userName")) ?? "Admin") : "Guest",
  });
});

api.patch("/settings", async (c) => {
  const db = c.get("db");
  const input = parse(
    z.object({
      workspaceName: z.string().min(1).max(60).optional(),
      userName: z.string().min(1).max(60).optional(),
    }),
    await c.req.json(),
  );
  if (input.workspaceName) {
    const workspace = await ensureWorkspace(c);
    await db
      .update(schema.workspaces)
      .set({ name: input.workspaceName })
      .where(eq(schema.workspaces.id, workspace.id));
  }
  if (input.userName && c.get("mode") === "private")
    await setSetting(db, "userName", input.userName);
  return c.json({ ok: true });
});

/* --------------------------------- helpers -------------------------------- */

async function githubStars(repo: string, exec: WaitUntil): Promise<number | null> {
  const cacheKey = new Request(`https://cache.inbound.internal/stars/${repo}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) return ((await hit.json()) as { stars: number | null }).stars;
  let stars: number | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { "user-agent": "inbound", accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok)
      stars = ((await res.json()) as { stargazers_count?: number }).stargazers_count ?? null;
  } catch {
    /* offline or rate limited — the sidebar just hides the count */
  }
  exec.waitUntil(
    cache.put(
      cacheKey,
      Response.json(
        { stars },
        { headers: { "cache-control": `max-age=${stars === null ? 300 : 3600}` } },
      ),
    ),
  );
  return stars;
}

api.all("*", (c) => c.json({ error: "not_found" }, 404));
