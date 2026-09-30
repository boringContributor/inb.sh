import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  Condition,
  EndpointIcon,
  IntegrationKind,
  ResponseConfig,
  RuleAction,
  SigningConfig,
} from "@inb/shared";

export const endpoints = sqliteTable(
  "endpoints",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    icon: text("icon").$type<EndpointIcon>().notNull().default("webhook"),
    retentionDays: integer("retention_days").notNull().default(7),
    response: text("response", { mode: "json" }).$type<ResponseConfig>().notNull(),
    signing: text("signing", { mode: "json" }).$type<SigningConfig | null>(),
    requestCount: integer("request_count").notNull().default(0),
    lastRequestAt: integer("last_request_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("endpoints_created_idx").on(t.createdAt)],
);

export const rules = sqliteTable(
  "rules",
  {
    id: text("id").primaryKey(),
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
  (t) => [index("rules_position_idx").on(t.position)],
);

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
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
  (t) => [index("archived_at_idx").on(t.archivedAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
