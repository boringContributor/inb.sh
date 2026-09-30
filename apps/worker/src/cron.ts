import { lt } from "drizzle-orm";
import type { Env } from "./env.ts";
import { getDb, schema } from "./db/repo.ts";

const DAY = 86_400_000;
const DELIVERY_RETENTION_DAYS = 30;

/** Hourly: prune delivery history. Request history expires inside each EndpointHub. */
export async function cleanup(env: Env) {
  const db = await getDb(env.Database);
  await db.delete(schema.deliveries).where(lt(schema.deliveries.createdAt, new Date(Date.now() - DELIVERY_RETENTION_DAYS * DAY)));
}
