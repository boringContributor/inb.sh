/**
 * What each kind of workspace may do. The public instance (inb.sh) runs
 * anonymous workspaces; signing in (Better Auth, planned) upgrades a
 * workspace to `member`. Self-hosted private instances use `self-hosted`.
 *
 * Every limit is enforced in the worker; the dashboard only reads these to
 * explain them.
 */
export type PlanId = "anonymous" | "member" | "self-hosted";

export interface Plan {
  id: PlanId;
  label: string;
  maxEndpoints: number | null;
  /** fixed lifetime from creation */
  endpointTtlHours: number | null;
  /** lifetime extended by every captured request */
  endpointIdleTtlHours: number | null;
  /** request history kept per endpoint */
  retentionDays: number;
  /** captured requests per endpoint per UTC day */
  dailyRequestsPerEndpoint: number | null;
  maxBodyBytes: number;
  maxRules: number | null;
  maxIntegrations: number | null;
  /** replays + integration deliveries per UTC day */
  dailyOutbound: number | null;
  /** text/html custom responses (phishing risk on a shared domain) */
  allowHtmlResponses: boolean;
  /** proxy mode turns the capture URL into a relay */
  allowProxy: boolean;
  customSlugs: boolean;
  /** retention can be changed per endpoint */
  configurableRetention: boolean;
}

const MB = 1024 * 1024;

export const PLANS: Record<PlanId, Plan> = {
  anonymous: {
    id: "anonymous",
    label: "Guest",
    maxEndpoints: 1,
    endpointTtlHours: 24,
    endpointIdleTtlHours: null,
    retentionDays: 1,
    dailyRequestsPerEndpoint: 1_000,
    maxBodyBytes: 1 * MB,
    maxRules: 3,
    maxIntegrations: 1,
    dailyOutbound: 100,
    allowHtmlResponses: false,
    allowProxy: false,
    customSlugs: false,
    configurableRetention: false,
  },
  member: {
    id: "member",
    label: "Member",
    maxEndpoints: 5,
    endpointTtlHours: null,
    endpointIdleTtlHours: 7 * 24,
    retentionDays: 7,
    dailyRequestsPerEndpoint: 10_000,
    maxBodyBytes: 5 * MB,
    maxRules: 25,
    maxIntegrations: 10,
    dailyOutbound: 2_000,
    allowHtmlResponses: false,
    allowProxy: true,
    customSlugs: true,
    configurableRetention: false,
  },
  "self-hosted": {
    id: "self-hosted",
    label: "Self-hosted",
    maxEndpoints: null,
    endpointTtlHours: null,
    endpointIdleTtlHours: null,
    retentionDays: 7,
    dailyRequestsPerEndpoint: null,
    maxBodyBytes: 10 * MB,
    maxRules: null,
    maxIntegrations: null,
    dailyOutbound: null,
    allowHtmlResponses: true,
    allowProxy: true,
    customSlugs: true,
    configurableRetention: true,
  },
};

export function isHtmlContentType(contentType: string): boolean {
  return /html|xhtml|svg/i.test(contentType);
}

/** "1 endpoint", "5 endpoints", "unlimited endpoints" */
export function describeLimit(n: number | null, noun: string): string {
  if (n === null) return `unlimited ${noun}s`;
  return `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
}
