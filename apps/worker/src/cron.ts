import { and, eq, inArray, isNotNull, lt, notInArray, or } from "drizzle-orm";
import type { Env } from "./env.ts";
import { getDb, schema, utcDay } from "./db/repo.ts";

const DAY = 86_400_000;
const DELIVERY_RETENTION_DAYS = 30;
/** guest workspaces with no endpoints are removed after this much inactivity */
const ABANDONED_WORKSPACE_DAYS = 3;
/** keep each run well inside the Workers free-plan CPU and subrequest budget */
const BATCH = 25;

/**
 * Hourly housekeeping:
 *   - expired endpoints: wipe their Durable Object, then delete the row
 *   - abandoned anonymous workspaces and everything they own
 *   - delivery log and usage counters past retention
 * Request history inside a live endpoint expires via the EndpointHub alarm.
 */
export async function cleanup(env: Env) {
  const db = await getDb(env.Database);
  const now = Date.now();

  const expired = await db.query.endpoints.findMany({
    columns: { id: true },
    where: or(
      and(isNotNull(schema.endpoints.expiresAt), lt(schema.endpoints.expiresAt, new Date(now))),
      isNotNull(schema.endpoints.deletedAt),
    ),
    limit: BATCH,
  });
  for (const { id } of expired) {
    await env.Hub.get(env.Hub.idFromName(id)).destroy();
  }
  if (expired.length) {
    const ids = expired.map((e) => e.id);
    await db.batch([
      db.delete(schema.rules).where(inArray(schema.rules.endpointId, ids)),
      db.delete(schema.endpoints).where(inArray(schema.endpoints.id, ids)),
    ]);
  }

  const live = db.select({ workspaceId: schema.endpoints.workspaceId }).from(schema.endpoints);
  const abandoned = await db.query.workspaces.findMany({
    columns: { id: true },
    where: and(
      eq(schema.workspaces.plan, "anonymous"),
      lt(schema.workspaces.lastSeenAt, new Date(now - ABANDONED_WORKSPACE_DAYS * DAY)),
      notInArray(schema.workspaces.id, live),
    ),
    limit: BATCH,
  });
  if (abandoned.length) {
    const ids = abandoned.map((w) => w.id);
    await db.batch([
      db.delete(schema.rules).where(inArray(schema.rules.workspaceId, ids)),
      db.delete(schema.integrations).where(inArray(schema.integrations.workspaceId, ids)),
      db.delete(schema.deliveries).where(inArray(schema.deliveries.workspaceId, ids)),
      db.delete(schema.archived).where(inArray(schema.archived.workspaceId, ids)),
      db.delete(schema.usage).where(inArray(schema.usage.workspaceId, ids)),
      db.delete(schema.workspaces).where(inArray(schema.workspaces.id, ids)),
    ]);
  }

  await db.batch([
    db
      .delete(schema.deliveries)
      .where(lt(schema.deliveries.createdAt, new Date(now - DELIVERY_RETENTION_DAYS * DAY))),
    db.delete(schema.usage).where(lt(schema.usage.day, utcDay(new Date(now - 7 * DAY)))),
  ]);
}
