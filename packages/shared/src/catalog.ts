import type { IntegrationKind } from "./types.ts";

export type IntegrationCategory = "Chat" | "Observability" | "Storage" | "Databases" | "Automation" | "Developer";

export interface IntegrationField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
  description?: string;
}

export interface IntegrationDefinition {
  kind: IntegrationKind;
  name: string;
  description: string;
  category: IntegrationCategory;
  /** lucide icon name */
  icon: string;
  fields: IntegrationField[];
  /** how deliveries are executed; `unsupported` kinds can be saved but not delivered yet */
  transport: "webhook" | "datadog" | "r2" | "pagerduty" | "sentry" | "stream" | "unsupported";
  /** build the short "target" label shown under the name */
  target: (config: Record<string, string>) => string;
}

const host = (url: string | undefined) => {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const webhookUrl: IntegrationField = {
  key: "url",
  label: "Webhook URL",
  placeholder: "https://…",
  secret: true,
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    kind: "slack",
    name: "Slack",
    description: "Post formatted requests into any channel.",
    category: "Chat",
    icon: "message-square",
    transport: "webhook",
    fields: [webhookUrl, { key: "channel", label: "Channel label", placeholder: "#payments", optional: true }],
    target: (c) => [c.channel, c.workspace || "slack.com"].filter(Boolean).join(" · "),
  },
  {
    kind: "discord",
    name: "Discord",
    description: "Post formatted requests into any channel.",
    category: "Chat",
    icon: "message-circle",
    transport: "webhook",
    fields: [webhookUrl, { key: "channel", label: "Channel label", placeholder: "#alerts", optional: true }],
    target: (c) => [c.channel, "discord.com"].filter(Boolean).join(" · "),
  },
  {
    kind: "teams",
    name: "Microsoft Teams",
    description: "Adaptive cards for your incident channel.",
    category: "Chat",
    icon: "users",
    transport: "webhook",
    fields: [webhookUrl],
    target: (c) => host(c.url),
  },
  {
    kind: "sentry",
    name: "Sentry",
    description: "Turn failing deliveries into issues.",
    category: "Observability",
    icon: "bug",
    transport: "sentry",
    fields: [{ key: "dsn", label: "DSN", placeholder: "https://key@o0.ingest.sentry.io/0", secret: true }],
    target: (c) => host(c.dsn),
  },
  {
    kind: "grafana",
    name: "Grafana",
    description: "Stream metrics and logs to your stack.",
    category: "Observability",
    icon: "gauge",
    transport: "webhook",
    fields: [
      { key: "url", label: "Loki push URL", placeholder: "https://logs-prod.grafana.net/loki/api/v1/push" },
      { key: "authorization", label: "Authorization header", placeholder: "Basic …", secret: true, optional: true },
    ],
    target: (c) => host(c.url),
  },
  {
    kind: "datadog",
    name: "Datadog",
    description: "Ship every request as a structured log.",
    category: "Observability",
    icon: "activity",
    transport: "datadog",
    fields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "site", label: "Site", placeholder: "datadoghq.eu" },
      { key: "service", label: "Service", placeholder: "inbound", optional: true },
    ],
    target: (c) => `logs · intake.${c.site || "datadoghq.com"}`,
  },
  {
    kind: "pagerduty",
    name: "PagerDuty",
    description: "Page someone when 5xx spikes.",
    category: "Observability",
    icon: "bell",
    transport: "pagerduty",
    fields: [{ key: "routingKey", label: "Integration key", secret: true }],
    target: () => "events.pagerduty.com",
  },
  {
    kind: "r2",
    name: "Cloudflare R2",
    description: "Archive raw requests as JSON objects.",
    category: "Storage",
    icon: "cloud",
    transport: "r2",
    fields: [{ key: "prefix", label: "Key prefix", placeholder: "inbound-archive/raw/" }],
    target: (c) => c.prefix || "inbound-archive/raw/",
  },
  {
    kind: "postgres",
    name: "Postgres",
    description: "Insert each request as a row.",
    category: "Databases",
    icon: "database",
    transport: "unsupported",
    fields: [{ key: "connectionString", label: "Connection string", secret: true }],
    target: (c) => host(c.connectionString?.replace(/^postgres(ql)?:/, "https:")),
  },
  {
    kind: "bigquery",
    name: "BigQuery",
    description: "Batch-load the raw event stream.",
    category: "Databases",
    icon: "table",
    transport: "unsupported",
    fields: [
      { key: "dataset", label: "Dataset", placeholder: "project.dataset.table" },
      { key: "credentials", label: "Service account JSON", secret: true },
    ],
    target: (c) => c.dataset ?? "",
  },
  {
    kind: "kafka",
    name: "Kafka",
    description: "Publish to a topic with exactly-once keys.",
    category: "Databases",
    icon: "layers",
    transport: "webhook",
    fields: [
      { key: "restProxyUrl", label: "REST proxy URL" },
      { key: "topic", label: "Topic" },
    ],
    target: (c) => c.topic ?? "",
  },
  {
    kind: "github-actions",
    name: "GitHub Actions",
    description: "Trigger a workflow on match.",
    category: "Developer",
    icon: "github",
    transport: "webhook",
    fields: [
      { key: "repo", label: "Repository", placeholder: "owner/repo" },
      { key: "eventType", label: "repository_dispatch event", placeholder: "inbound" },
      { key: "token", label: "Token", secret: true },
    ],
    target: (c) => c.repo ?? "",
  },
  {
    kind: "zapier",
    name: "Zapier",
    description: "Fan out to 6,000+ apps.",
    category: "Automation",
    icon: "zap",
    transport: "webhook",
    fields: [webhookUrl],
    target: (c) => host(c.url),
  },
  {
    kind: "n8n",
    name: "n8n",
    description: "Self-hosted automation, self-hosted inbox.",
    category: "Automation",
    icon: "share-2",
    transport: "webhook",
    fields: [webhookUrl],
    target: (c) => host(c.url),
  },
  {
    kind: "http",
    name: "HTTP forward",
    description: "Forward the request to any URL.",
    category: "Developer",
    icon: "globe",
    transport: "webhook",
    fields: [
      { key: "url", label: "Destination URL", placeholder: "https://api.example.com/hooks" },
      { key: "authorization", label: "Authorization header", secret: true, optional: true },
    ],
    target: (c) => host(c.url),
  },
  {
    kind: "cli",
    name: "CLI stream",
    description: "inbound tail --follow over SSE.",
    category: "Developer",
    icon: "terminal",
    transport: "stream",
    fields: [],
    target: () => "SSE stream",
  },
];

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "Chat",
  "Observability",
  "Storage",
  "Databases",
  "Automation",
  "Developer",
];

export function integrationDefinition(kind: IntegrationKind): IntegrationDefinition {
  const def = INTEGRATIONS.find((i) => i.kind === kind);
  if (!def) throw new Error(`Unknown integration kind: ${kind}`);
  return def;
}
