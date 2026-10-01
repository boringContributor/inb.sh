import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { and, eq, gte, sql } from "drizzle-orm";
import { type InstanceMode, PLANS, type Plan } from "@inb/shared";
import { type Env, type HonoEnv, secret } from "../env.ts";
import { type DB, schema, utcDay } from "../db/repo.ts";
import { hmac, safeEqual, toBase64Url, toHex } from "./crypto.ts";
import { workspaceId as newWorkspaceId } from "./ids.ts";
import { isAuthenticated } from "./auth.ts";

export type WorkspaceRow = typeof schema.workspaces.$inferSelect;

const COOKIE = "inb_ws";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 400;
/** anonymous workspaces one IP may create per 24h */
const WORKSPACES_PER_IP_PER_DAY = 5;
const DAY = 86_400_000;

export const DEFAULT_WORKSPACE = "default";

export function instanceMode(env: Env): InstanceMode {
  return env.INBOUND_MODE === "public" ? "public" : "private";
}

export function planOf(workspace: WorkspaceRow | null, mode: InstanceMode): Plan {
  if (workspace) return PLANS[workspace.plan];
  return mode === "public" ? PLANS.anonymous : PLANS["self-hosted"];
}

function signingKey(env: Env): string {
  const key = secret(env, "SessionSecret") ?? secret(env, "AdminPassword");
  if (key) return key;
  if (env.DEV === "true") return "inb-local-dev";
  throw new Error("SessionSecret is not configured");
}

async function signId(env: Env, id: string) {
  return toBase64Url(await hmac(signingKey(env), `ws.${id}`));
}

/**
 * The workspace token is `<workspace id>.<signature>`. Browsers send it as a
 * cookie; the CLI sends the same value as `Authorization: Bearer <token>`.
 */
async function readCookie(c: Context<HonoEnv>): Promise<string | null> {
  const auth = c.req.header("authorization");
  const value =
    getCookie(c, COOKIE) ?? (auth?.startsWith("Bearer ws_") ? auth.slice(7) : undefined);
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig) return null;
  return safeEqual(sig, await signId(c.env, id)) ? id : null;
}

/**
 * Resolve who is calling and what they may do.
 *   private mode: the admin session owns the `default` workspace.
 *   public mode:  a signed cookie names an anonymous workspace (or none yet).
 */
export const resolveWorkspace: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const db = c.get("db");
  const mode = instanceMode(c.env);
  let workspace: WorkspaceRow | null = null;
  if (mode === "private") {
    if (await isAuthenticated(c)) {
      workspace =
        (await db.query.workspaces.findFirst({
          where: eq(schema.workspaces.id, DEFAULT_WORKSPACE),
        })) ?? null;
    }
  } else {
    const id = await readCookie(c);
    if (id && id !== DEFAULT_WORKSPACE) {
      workspace =
        (await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) })) ?? null;
    }
    if (workspace && Date.now() - workspace.lastSeenAt.getTime() > 3_600_000) {
      const id = workspace.id;
      c.executionCtx.waitUntil(
        db
          .update(schema.workspaces)
          .set({ lastSeenAt: new Date() })
          .where(eq(schema.workspaces.id, id))
          .run(),
      );
    }
  }
  c.set("mode", mode);
  c.set("workspace", workspace);
  c.set("plan", planOf(workspace, mode));
  await next();
};

/** Private mode: reject unauthenticated calls outright. */
export const requirePrivateAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (c.get("mode") === "private" && !c.get("workspace"))
    return c.json({ error: "unauthorized" }, 401);
  await next();
};

async function ipHash(env: Env, ip: string | undefined) {
  if (!ip) return null;
  return toHex(await hmac(signingKey(env), `ip.${ip}`)).slice(0, 32);
}

/**
 * The calling workspace, creating an anonymous one on first write in public
 * mode. Workspaces are only created on demand, so drive-by page views and
 * crawlers cost nothing.
 */
export async function ensureWorkspace(c: Context<HonoEnv>): Promise<WorkspaceRow> {
  const existing = c.get("workspace");
  if (existing) return existing;
  if (c.get("mode") === "private") {
    throw new HTTPException(401, {
      res: Response.json({ error: "unauthorized" }, { status: 401 }),
    });
  }
  const db = c.get("db");
  const hash = await ipHash(c.env, c.req.header("cf-connecting-ip"));
  if (hash) {
    const recent = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.workspaces)
      .where(
        and(
          eq(schema.workspaces.creatorIpHash, hash),
          gte(schema.workspaces.createdAt, new Date(Date.now() - DAY)),
        ),
      );
    if ((recent[0]?.n ?? 0) >= WORKSPACES_PER_IP_PER_DAY) {
      throw planLimit(
        "workspaces",
        "Too many new workspaces from your network today. Try again tomorrow.",
        429,
      );
    }
  }
  const now = new Date();
  const [row] = await db
    .insert(schema.workspaces)
    .values({
      id: newWorkspaceId(),
      plan: "anonymous",
      creatorIpHash: hash,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning();
  setCookie(c, COOKIE, `${row!.id}.${await signId(c.env, row!.id)}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  c.set("workspace", row!);
  c.set("plan", planOf(row!, "public"));
  return row!;
}

export function planLimit(limit: string, message: string, status: 403 | 413 | 429 = 403) {
  return new HTTPException(status, {
    res: Response.json({ error: "plan_limit", limit, message }, { status }),
  });
}

/**
 * Count one outbound call (replay or delivery) against the workspace's daily
 * quota. Returns false once the quota is used up.
 */
export async function consumeOutbound(
  db: DB,
  workspaceId: string,
  plan: Plan,
  n = 1,
): Promise<boolean> {
  if (plan.dailyOutbound === null) return true;
  const day = utcDay();
  const [row] = await db
    .insert(schema.usage)
    .values({ workspaceId, day, outbound: n })
    .onConflictDoUpdate({
      target: [schema.usage.workspaceId, schema.usage.day],
      set: { outbound: sql`${schema.usage.outbound} + ${n}` },
    })
    .returning({ outbound: schema.usage.outbound });
  return (row?.outbound ?? 0) <= plan.dailyOutbound;
}

/** Endpoint expiry for a plan: fixed from creation, or sliding from last activity. */
export function endpointExpiry(plan: Plan, createdAt: Date, lastActivity: Date): Date | null {
  if (plan.endpointTtlHours !== null)
    return new Date(createdAt.getTime() + plan.endpointTtlHours * 3_600_000);
  if (plan.endpointIdleTtlHours !== null)
    return new Date(lastActivity.getTime() + plan.endpointIdleTtlHours * 3_600_000);
  return null;
}

/** The caller's CLI token: the same signed value their browser holds as a cookie. */
export async function workspaceToken(env: Env, workspaceId: string): Promise<string> {
  return `${workspaceId}.${await signId(env, workspaceId)}`;
}
