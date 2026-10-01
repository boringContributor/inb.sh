import { z } from "zod";
import type { Plan } from "./plans.ts";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export const headerPairSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(8192),
});
export type HeaderPair = z.infer<typeof headerPairSchema>;

export const responseModeSchema = z.enum(["static", "template", "proxy"]);
export type ResponseMode = z.infer<typeof responseModeSchema>;

export const responseConfigSchema = z.object({
  enabled: z.boolean(),
  mode: responseModeSchema,
  status: z.number().int().min(100).max(599),
  contentType: z.string().max(256),
  delayMs: z.number().int().min(0).max(30_000),
  headers: z.array(headerPairSchema).max(50),
  body: z.string().max(256 * 1024),
  proxyUrl: z.string().url().or(z.literal("")).optional(),
});
export type ResponseConfig = z.infer<typeof responseConfigSchema>;

export const DEFAULT_RESPONSE: ResponseConfig = {
  enabled: false,
  mode: "static",
  status: 200,
  contentType: "application/json",
  delayMs: 0,
  headers: [],
  body: '{\n  "received": true\n}',
  proxyUrl: "",
};

export const signingProviderSchema = z.enum([
  "stripe",
  "github",
  "shopify",
  "slack",
  "hmac-sha256",
]);
export type SigningProvider = z.infer<typeof signingProviderSchema>;

export const signingConfigSchema = z.object({
  provider: signingProviderSchema,
  secret: z.string().min(1).max(512),
  header: z.string().max(128).optional(),
});
export type SigningConfig = z.infer<typeof signingConfigSchema>;

export const ENDPOINT_ICONS = [
  "webhook",
  "git-branch",
  "shopping-bag",
  "terminal",
  "globe",
  "zap",
  "credit-card",
  "mail",
  "bell",
  "box",
] as const;
export const endpointIconSchema = z.enum(ENDPOINT_ICONS);
export type EndpointIcon = z.infer<typeof endpointIconSchema>;

export const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase letters, digits and dashes");

export interface Endpoint {
  id: string;
  slug: string;
  name: string;
  icon: EndpointIcon;
  retentionDays: number;
  response: ResponseConfig;
  /** secret is never returned, only `hasSecret` */
  signing: { provider: SigningProvider; header?: string; hasSecret: boolean } | null;
  createdAt: string;
  requestCount: number;
  lastRequestAt: string | null;
  /** when the endpoint (and its history) is deleted; null = never */
  expiresAt: string | null;
  /** requests captured today (UTC) and the plan's cap */
  usage: { today: number; dailyLimit: number | null };
}

export const createEndpointSchema = z.object({
  name: z.string().min(1).max(80),
  icon: endpointIconSchema.default("webhook"),
  slug: slugSchema.optional(),
});
export type CreateEndpointInput = z.input<typeof createEndpointSchema>;

export const updateEndpointSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  icon: endpointIconSchema.optional(),
  retentionDays: z.number().int().min(1).max(90).optional(),
  response: responseConfigSchema.optional(),
  /** omit `secret` to keep the stored one */
  signing: signingConfigSchema
    .extend({ secret: z.string().min(1).max(512).optional() })
    .nullable()
    .optional(),
});
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;

export type BodyEncoding = "utf8" | "base64";

export type ResponseSource = "default" | "custom" | "rule" | "proxy";

export interface RequestSummary {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  status: number;
  size: number;
  contentType: string | null;
  summary: string;
  receivedAt: string;
  replayCount: number;
}

export type RequestEventType =
  | "received"
  | "matched"
  | "responded"
  | "delivered"
  | "delivery_failed"
  | "replayed";

export interface RequestEvent {
  type: RequestEventType;
  at: string;
  label: string;
  detail: string;
}

export interface CapturedRequest extends RequestSummary {
  query: [string, string][];
  headers: [string, string][];
  body: string;
  bodyEncoding: BodyEncoding;
  bodyTruncated: boolean;
  ip: string | null;
  country: string | null;
  userAgent: string | null;
  signature: { provider: SigningProvider; verified: boolean } | null;
  response: {
    status: number;
    headers: [string, string][];
    body: string;
    durationMs: number;
    source: ResponseSource;
  };
  matchedRules: { id: string; name: string }[];
  events: RequestEvent[];
}

export interface RequestPage {
  items: RequestSummary[];
  total: number;
  counts: { all: number; "2xx": number; "4xx": number; "5xx": number; replayed: number };
  nextCursor: string | null;
}

export const requestFilterSchema = z.enum(["all", "2xx", "4xx", "5xx", "replayed"]);
export type RequestFilter = z.infer<typeof requestFilterSchema>;

/* ---------------------------------- Rules --------------------------------- */

export const conditionOpSchema = z.enum([
  "is",
  "is_not",
  "contains",
  "starts_with",
  "ends_with",
  "matches",
  "exists",
  "missing",
  "gt",
  "lt",
]);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

export const conditionSchema = z.object({
  field: z.string().min(1).max(256),
  op: conditionOpSchema,
  value: z.string().max(1024).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("forward"), integrationId: z.string().min(1) }),
  z.object({
    type: z.literal("respond"),
    status: z.number().int().min(100).max(599),
    body: z
      .string()
      .max(64 * 1024)
      .default(""),
    contentType: z.string().max(256).default("application/json"),
  }),
  z.object({
    type: z.literal("replay"),
    url: z.string().url(),
    onlyWhileTunnel: z.boolean().default(false),
  }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("drop") }),
]);
export type RuleAction = z.infer<typeof actionSchema>;

export const ruleInputSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  endpointId: z.string().nullable().default(null),
  conditions: z.array(conditionSchema).max(20).default([]),
  transform: z
    .string()
    .max(32 * 1024)
    .nullable()
    .default(null),
  actions: z.array(actionSchema).max(10).default([]),
});
export type RuleInput = z.input<typeof ruleInputSchema>;

/** PATCH body: no defaults, so omitted fields are left untouched. */
export const ruleUpdateSchema = z
  .object({
    name: z.string().min(1).max(120),
    enabled: z.boolean(),
    endpointId: z.string().nullable(),
    conditions: z.array(conditionSchema).max(20),
    transform: z
      .string()
      .max(32 * 1024)
      .nullable(),
    actions: z.array(actionSchema).max(10),
  })
  .partial();
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;

export interface Rule {
  id: string;
  name: string;
  position: number;
  enabled: boolean;
  endpointId: string | null;
  conditions: Condition[];
  transform: string | null;
  actions: RuleAction[];
  stats: { runs: number; ok: number; failed: number; blocked: number; lastRunAt: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface DryRunResult {
  requestId: string | null;
  matched: boolean;
  conditions: { condition: Condition; passed: boolean; actual: unknown }[];
  transformed: { headers: Record<string, string>; body: unknown } | null;
  transformError: string | null;
  actions: { action: RuleAction; description: string }[];
}

/* ------------------------------ Integrations ------------------------------ */

export const integrationKindSchema = z.enum([
  "slack",
  "discord",
  "teams",
  "http",
  "datadog",
  "r2",
  "sentry",
  "grafana",
  "pagerduty",
  "postgres",
  "bigquery",
  "kafka",
  "github-actions",
  "zapier",
  "n8n",
  "cli",
]);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

export const integrationInputSchema = z.object({
  kind: integrationKindSchema,
  name: z.string().min(1).max(80),
  config: z.record(z.string(), z.string().max(4096)),
  enabled: z.boolean().default(true),
});
export type IntegrationInput = z.input<typeof integrationInputSchema>;

export const integrationUpdateSchema = z
  .object({
    name: z.string().min(1).max(80),
    config: z.record(z.string(), z.string().max(4096)),
    enabled: z.boolean(),
  })
  .partial();
export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>;

export interface Integration {
  id: string;
  kind: IntegrationKind;
  name: string;
  target: string;
  /** secret fields are replaced with "••••" */
  config: Record<string, string>;
  enabled: boolean;
  health: "ok" | "degraded" | "failing" | "idle";
  stats: { delivered: number; okRate: number | null; lastDeliveryAt: string | null };
  /** delivery counts, oldest → newest, 24 hourly buckets */
  series: number[];
  createdAt: string;
}

export interface Delivery {
  id: string;
  integrationId: string;
  requestId: string;
  endpointId: string;
  ruleId: string | null;
  status: number | null;
  ok: boolean;
  attempts: number;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

/* --------------------------------- Session -------------------------------- */

export type InstanceMode = "public" | "private";

export interface AppConfig {
  /** `public`: anonymous workspaces with plan limits (inb.sh). `private`: one password-protected workspace. */
  mode: InstanceMode;
  captureBaseUrl: string;
  workspaceName: string;
  /** null in private mode until signed in; in public mode always a guest or member */
  user: { name: string; initials: string; plan: string } | null;
  /** null for a first-time visitor in public mode — created with their first endpoint */
  workspace: { id: string; createdAt: string } | null;
  plan: Plan;
  /** sign-in (accounts) is available on this instance */
  accounts: boolean;
  githubRepo: string;
  githubStars: number | null;
}

export interface PipelineStats {
  receivedToday: number;
  rules: number;
  activeTransforms: number;
  customResponses: number;
  avgResponseMs: number | null;
  integrations: number;
}

/* ----------------------------- Live messages ------------------------------ */

export type LiveMessage =
  | { type: "request"; request: RequestSummary }
  | { type: "request_updated"; request: RequestSummary }
  | { type: "event"; requestId: string; event: RequestEvent }
  | { type: "cleared" }
  | { type: "hello"; listeners: number };
