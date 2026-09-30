import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  type Endpoint,
  type Integration,
  type Rule,
  integrationDefinition,
} from "@inb/shared";
import * as schema from "./schema.ts";
import { ensureMigrated } from "./migrate.ts";

export type DB = DrizzleD1Database<typeof schema>;

export async function getDb(d1: D1Database): Promise<DB> {
  await ensureMigrated(d1);
  return drizzle(d1, { schema });
}

export type EndpointRow = typeof schema.endpoints.$inferSelect;
export type RuleRow = typeof schema.rules.$inferSelect;
export type IntegrationRow = typeof schema.integrations.$inferSelect;

export function toEndpoint(row: EndpointRow): Endpoint {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    retentionDays: row.retentionDays,
    response: row.response,
    signing: row.signing
      ? { provider: row.signing.provider, header: row.signing.header, hasSecret: !!row.signing.secret }
      : null,
    createdAt: row.createdAt.toISOString(),
    requestCount: row.requestCount,
    lastRequestAt: row.lastRequestAt?.toISOString() ?? null,
  };
}

export function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    enabled: row.enabled,
    endpointId: row.endpointId,
    conditions: row.conditions,
    transform: row.transform,
    actions: row.actions,
    stats: {
      runs: row.runs,
      ok: row.ok,
      failed: row.failed,
      blocked: row.blocked,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const REDACTED = "••••••••";

export function redactConfig(row: IntegrationRow): Record<string, string> {
  const def = integrationDefinition(row.kind);
  const secretKeys = new Set(def.fields.filter((f) => f.secret).map((f) => f.key));
  return Object.fromEntries(
    Object.entries(row.config).map(([k, v]) => [k, secretKeys.has(k) && v ? REDACTED : v]),
  );
}

/** Merge an update, keeping secrets the client sent back redacted. */
export function mergeConfig(previous: Record<string, string>, next: Record<string, string>) {
  return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v === REDACTED ? (previous[k] ?? "") : v]));
}

export async function findEndpointBySlug(db: DB, slug: string) {
  return db.query.endpoints.findFirst({
    where: and(eq(schema.endpoints.slug, slug), isNull(schema.endpoints.deletedAt)),
  });
}

export async function findEndpoint(db: DB, id: string) {
  return db.query.endpoints.findFirst({
    where: and(eq(schema.endpoints.id, id), isNull(schema.endpoints.deletedAt)),
  });
}

export async function listEndpoints(db: DB) {
  return db.query.endpoints.findMany({
    where: isNull(schema.endpoints.deletedAt),
    orderBy: asc(schema.endpoints.createdAt),
  });
}

export async function activeRules(db: DB, endpointId: string) {
  const rows = await db.query.rules.findMany({
    where: eq(schema.rules.enabled, true),
    orderBy: asc(schema.rules.position),
  });
  return rows.filter((r) => r.endpointId === null || r.endpointId === endpointId);
}

const HOUR = 3_600_000;

/** Integrations with 24h hourly delivery series and health. */
export async function listIntegrations(db: DB): Promise<Integration[]> {
  const rows = await db.query.integrations.findMany({ orderBy: asc(schema.integrations.createdAt) });
  if (!rows.length) return [];
  const since = Date.now() - 24 * HOUR;
  const buckets = await db
    .select({
      integrationId: schema.deliveries.integrationId,
      bucket: sql<number>`(${schema.deliveries.createdAt} - ${since}) / ${HOUR}`.as("bucket"),
      total: sql<number>`count(*)`,
      ok: sql<number>`sum(${schema.deliveries.ok})`,
    })
    .from(schema.deliveries)
    .where(gte(schema.deliveries.createdAt, new Date(since)))
    .groupBy(schema.deliveries.integrationId, sql`bucket`);
  const totals = await db
    .select({
      integrationId: schema.deliveries.integrationId,
      total: sql<number>`count(*)`,
      ok: sql<number>`sum(${schema.deliveries.ok})`,
      last: sql<number | null>`max(${schema.deliveries.createdAt})`,
    })
    .from(schema.deliveries)
    .groupBy(schema.deliveries.integrationId);

  return rows.map((row) => {
    const def = integrationDefinition(row.kind);
    const series = Array.from({ length: 24 }, () => 0);
    let recentTotal = 0;
    let recentOk = 0;
    for (const b of buckets) {
      if (b.integrationId !== row.id) continue;
      const idx = Math.min(23, Math.max(0, Math.floor(b.bucket)));
      series[idx] = (series[idx] ?? 0) + b.total;
      recentTotal += b.total;
      recentOk += b.ok;
    }
    const t = totals.find((x) => x.integrationId === row.id);
    const okRate = t && t.total ? t.ok / t.total : null;
    const recentRate = recentTotal ? recentOk / recentTotal : null;
    const health: Integration["health"] =
      recentRate === null ? "idle" : recentRate >= 0.99 ? "ok" : recentRate >= 0.9 ? "degraded" : "failing";
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      target: def.target(row.config),
      config: redactConfig(row),
      enabled: row.enabled,
      health,
      stats: { delivered: t?.total ?? 0, okRate, lastDeliveryAt: t?.last ? new Date(t.last).toISOString() : null },
      series,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function recentDeliveries(db: DB, opts: { integrationId?: string; requestId?: string; limit: number }) {
  const where = opts.integrationId
    ? eq(schema.deliveries.integrationId, opts.integrationId)
    : opts.requestId
      ? eq(schema.deliveries.requestId, opts.requestId)
      : undefined;
  return db.query.deliveries.findMany({ where, orderBy: desc(schema.deliveries.createdAt), limit: opts.limit });
}

export async function getSetting(db: DB, key: string): Promise<string | undefined> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return row?.value;
}

export async function setSetting(db: DB, key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export { schema };
