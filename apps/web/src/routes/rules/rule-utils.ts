import type { Condition, Integration, Rule, RuleAction, Tone } from "@inb/shared";

/** The editor's working copy of a rule (fully populated, unlike `RuleInput`). */
export interface Draft {
  name: string;
  enabled: boolean;
  endpointId: string | null;
  conditions: Condition[];
  transform: string | null;
  actions: RuleAction[];
}

export const DEFAULT_TRANSFORM = `$merge([$, {
  "headers": $merge([headers, {"x-source": "inbound"}]),
  "body": $pick(body, "id", "type", "data")
}])`;

export function toDraft(rule: Rule): Draft {
  return {
    name: rule.name,
    enabled: rule.enabled,
    endpointId: rule.endpointId,
    conditions: rule.conditions.map((c) => ({ ...c })),
    transform: rule.transform,
    actions: rule.actions.map((a) => ({ ...a })),
  };
}

export function emptyDraft(): Draft {
  return {
    name: "Untitled rule",
    enabled: true,
    endpointId: null,
    conditions: [{ field: "method", op: "is", value: "POST" }],
    transform: null,
    actions: [],
  };
}

/** Normalise before comparing / saving: an empty transform is no transform. */
export function normaliseDraft(d: Draft): Draft {
  return {
    ...d,
    name: d.name.trim() || "Untitled rule",
    transform: d.transform?.trim() ? d.transform : null,
  };
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(normaliseDraft(a)) === JSON.stringify(normaliseDraft(b));
}

export interface RuleTemplate {
  id: string;
  title: string;
  description: string;
  build: (integrations: Integration[]) => Draft;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "unsigned",
    title: "Block unsigned Stripe requests",
    description: "Answer 401 when the stripe-signature header is missing.",
    build: () => ({
      name: "Block unsigned requests",
      enabled: true,
      endpointId: null,
      conditions: [{ field: "header stripe-signature", op: "missing", value: "" }],
      transform: null,
      actions: [
        {
          type: "respond",
          status: 401,
          contentType: "application/json",
          body: '{\n  "error": "missing signature"\n}',
        },
      ],
    }),
  },
  {
    id: "payments",
    title: "Forward payments to Slack",
    description: "Send invoice events to a channel, trimmed to the fields that matter.",
    build: (integrations) => {
      const slack = integrations.find((i) => i.kind === "slack") ?? integrations[0];
      return {
        name: "Forward payments",
        enabled: true,
        endpointId: null,
        conditions: [
          { field: "method", op: "is", value: "POST" },
          { field: "body.type", op: "starts_with", value: '"invoice."' },
        ],
        transform: DEFAULT_TRANSFORM,
        actions: slack ? [{ type: "forward", integrationId: slack.id }] : [],
      };
    },
  },
  {
    id: "alerts",
    title: "Alert on 5xx",
    description: "Notify an integration whenever the reply was a server error.",
    build: (integrations) => {
      const target =
        integrations.find((i) => ["discord", "slack", "pagerduty"].includes(i.kind)) ??
        integrations[0];
      return {
        name: "Alert on failures",
        enabled: true,
        endpointId: null,
        conditions: [{ field: "response.status", op: "is", value: "5xx" }],
        transform: null,
        actions: target ? [{ type: "forward", integrationId: target.id }] : [],
      };
    },
  },
];

export interface RuleChip {
  label: string;
  tone: Tone;
  mono?: boolean;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function integrationLabel(integration: Integration | undefined): string {
  if (!integration) return "Missing integration";
  const channel = integration.config.channel;
  return channel ? `${integration.name} ${channel}` : integration.name;
}

export function ruleChips(
  rule: Pick<Rule, "transform" | "actions">,
  integrations: Integration[],
): RuleChip[] {
  const chips: RuleChip[] = [];
  if (rule.transform?.trim()) {
    chips.push({ label: "Transform", tone: "accent" });
    if (rule.transform.includes("$mask")) chips.push({ label: "mask", tone: "default" });
  }
  for (const action of rule.actions) {
    switch (action.type) {
      case "forward":
        chips.push({
          label: integrationLabel(integrations.find((i) => i.id === action.integrationId)),
          tone: "success",
        });
        break;
      case "respond":
        chips.push({
          label: `Respond ${action.status}`,
          tone: action.status >= 400 ? "danger" : "success",
        });
        break;
      case "replay":
        chips.push(
          { label: "Replay", tone: "accent" },
          { label: host(action.url), tone: "default" },
        );
        break;
      case "archive":
        chips.push({ label: "Archive", tone: "default" });
        break;
      case "drop":
        chips.push({ label: "Drop", tone: "danger" });
        break;
    }
  }
  return chips;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (s < 45) return "just now";
  if (s < 3600) return unit(Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86_400) return unit(Math.round(s / 3600), "hour");
  if (s < 30 * 86_400) return unit(Math.round(s / 86_400), "day");
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** `1,284 runs · 99.8% ok`, `37 runs · blocked`, `3,105 runs · paused`, `12 runs · last 1h ago`. */
export function ruleStat(rule: Rule): string {
  const runs = `${rule.stats.runs.toLocaleString("en-US")} ${rule.stats.runs === 1 ? "run" : "runs"}`;
  if (!rule.enabled) return `${runs} · paused`;
  if (rule.actions.some((a) => a.type === "respond" && a.status >= 400)) return `${runs} · blocked`;
  if (rule.stats.runs === 0) return "no runs yet";
  const delivers = rule.actions.some((a) => a.type === "forward" || a.type === "replay");
  if (delivers && rule.stats.ok > 0) {
    const pct = (rule.stats.ok / (rule.stats.ok + rule.stats.failed)) * 100;
    return `${runs} · ${pct >= 99.95 ? "100" : pct.toFixed(1)}% ok`;
  }
  if (rule.stats.lastRunAt) return `${runs} · last ${shortAgo(rule.stats.lastRunAt)}`;
  return runs;
}

export function describeAction(
  action: RuleAction,
  integrations: Integration[],
): { title: string; subtitle: string } {
  switch (action.type) {
    case "forward": {
      const integration = integrations.find((i) => i.id === action.integrationId);
      return {
        title: integration ? `Forward to ${integration.name}` : "Forward to…",
        subtitle: integration
          ? `${integration.target || integration.kind} · retries 4× with backoff`
          : "Pick an integration",
      };
    }
    case "respond":
      return {
        title: `Respond ${action.status}`,
        subtitle: `${action.contentType}${action.body.trim() ? " · custom body" : " · empty body"}`,
      };
    case "replay":
      return {
        title: action.url ? `Replay to ${host(action.url)}` : "Replay to…",
        subtitle: action.onlyWhileTunnel ? "only while the dev tunnel is open" : "on every match",
      };
    case "archive":
      return { title: "Archive", subtitle: "keep the request past retention" };
    case "drop":
      return { title: "Drop", subtitle: "don't store or forward the request" };
  }
}

export function newAction(type: RuleAction["type"], integrations: Integration[]): RuleAction {
  switch (type) {
    case "forward":
      return { type, integrationId: integrations[0]?.id ?? "" };
    case "respond":
      return { type, status: 200, contentType: "application/json", body: "" };
    case "replay":
      return { type, url: "http://localhost:4000", onlyWhileTunnel: true };
    case "archive":
      return { type };
    case "drop":
      return { type };
  }
}
