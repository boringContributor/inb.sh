import type { EndpointHub } from "./hub.ts";
import type { DeliveryJob } from "./deliver/job.ts";
import type { InstanceMode, Plan } from "@inb/shared";
import type { DB } from "./db/repo.ts";
import type { WorkspaceRow } from "./lib/workspace.ts";

export type HonoEnv = {
  Bindings: Env;
  Variables: { db: DB; mode: InstanceMode; workspace: WorkspaceRow | null; plan: Plan };
};
export type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

/**
 * Bindings wired up in `sst.config.ts`. Linked components are bound under
 * their component name; linked `sst.Secret`s arrive as `SST_RESOURCE_<Name>`
 * JSON strings.
 */
export interface Env {
  Database: D1Database;
  Archive: R2Bucket;
  Deliveries: Queue<DeliveryJob>;
  Hub: DurableObjectNamespace<EndpointHub>;
  ASSETS?: Fetcher;

  SST_RESOURCE_AdminPassword?: string;
  SST_RESOURCE_SessionSecret?: string;

  /** e.g. `inb.sh` — requests to this host are captured at `/<slug>/*` */
  CAPTURE_HOST?: string;
  /** public origin of the dashboard, e.g. `https://app.inb.sh` */
  APP_ORIGIN?: string;
  GITHUB_REPO?: string;
  /** `public` (anonymous workspaces + plan limits) or `private` (password, default) */
  INBOUND_MODE?: string;
  /** set by `wrangler dev` so auth can be bypassed locally */
  DEV?: string;
}

export function secret(env: Env, name: "AdminPassword" | "SessionSecret"): string | undefined {
  const raw = env[`SST_RESOURCE_${name}`];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { value?: string };
    return parsed.value ?? undefined;
  } catch {
    return raw;
  }
}
