import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  Condition,
  EndpointIcon,
  IntegrationKind,
  PlanId,
  ResponseConfig,
  RuleAction,
  SigningConfig,
} from "@inb/shared";

/**
 * The ownership unit. Public instances create an anonymous workspace per
 * visitor (signed cookie); `ownerUserId` is where an account (Better Auth,
 * planned) claims one. Private instances use the single `default` workspace.
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  plan: text("plan").$type<PlanId>().notNull(),
  name: text("name"),
  ownerUserId: text("owner_user_id"),
  /** salted hash, only used to cap workspace creation per IP */
  creatorIpHash: text("creator_ip_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});

/** Per-workspace daily counters for outbound traffic (replays + deliveries). */
export const usage = sqliteTable(
  "usage",
  {
    workspaceId: text("workspace_id").notNull(),
    day: text("day").notNull(),
    outbound: integer("outbound").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day] })],
);

export const endpoints = sqliteTable(
  "endpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().default("default"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    icon: text("icon").$type<EndpointIcon>().notNull().default("webhook"),
    retentionDays: integer("retention_days").notNull().default(7),
    response: text("response", { mode: "json" }).$type<ResponseConfig>().notNull(),
    signing: text("signing", { mode: "json" }).$type<SigningConfig | null>(),
    requestCount: integer("request_count").notNull().default(0),
    lastRequestAt: integer("last_request_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    /** UTC day (YYYY-MM-DD) that `dayCount` belongs to */
    dayKey: text("day_key"),
    dayCount: integer("day_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("endpoints_created_idx").on(t.createdAt),
    index("endpoints_workspace_idx").on(t.workspaceId),
    index("endpoints_expires_idx").on(t.expiresAt),
  ],
);

export const rules = sqliteTable(
  "rules",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().default("default"),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    endpointId: text("endpoint_id"),
    conditions: text("conditions", { mode: "json" }).$type<Condition[]>().notNull(),
    transform: text("transform"),
    actions: text("actions", { mode: "json" }).$type<RuleAction[]>().notNull(),
    runs: integer("runs").notNull().default(0),
    ok: integer("ok").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("rules_position_idx").on(t.workspaceId, t.position)],
);

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().default("default"),
  kind: text("kind").$type<IntegrationKind>().notNull(),
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, string>>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().default("default"),
    integrationId: text("integration_id").notNull(),
    requestId: text("request_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    ruleId: text("rule_id"),
    status: integer("status"),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("deliveries_integration_idx").on(t.integrationId, t.createdAt),
    index("deliveries_created_idx").on(t.createdAt),
  ],
);

export const archived = sqliteTable(
  "archived_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().default("default"),
    endpointId: text("endpoint_id").notNull(),
    /** full CapturedRequest JSON */
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    summary: text("summary").notNull(),
    size: integer("size").notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("archived_at_idx").on(t.workspaceId, t.archivedAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
