import { PLANS, type Plan } from "@inb/shared";
import { useConfig, useEndpoints, useIntegrations, useRules } from "./queries.ts";

const atLimit = (count: number | undefined, max: number | null) =>
  max !== null && (count ?? 0) >= max;

/**
 * What the current workspace may still do. The worker enforces all of this;
 * the dashboard uses it to disable actions up front and explain why.
 */
export function usePlan() {
  const { data: config } = useConfig();
  const plan: Plan = config?.plan ?? PLANS["self-hosted"];
  const isPublic = config?.mode === "public";
  return { config, plan, isPublic, isGuest: isPublic && plan.id === "anonymous" };
}

export function useEndpointLimit() {
  const { plan } = usePlan();
  const { data: endpoints } = useEndpoints();
  return {
    reached: atLimit(endpoints?.length, plan.maxEndpoints),
    reason:
      plan.maxEndpoints === 1
        ? "Guests get one endpoint at a time. Delete it to create another."
        : `Your plan allows ${plan.maxEndpoints} endpoints.`,
  };
}

export function useRuleLimit() {
  const { plan } = usePlan();
  const { data: rules } = useRules();
  return {
    reached: atLimit(rules?.length, plan.maxRules),
    reason: `Your plan allows ${plan.maxRules} rules.`,
  };
}

export function useIntegrationLimit() {
  const { plan } = usePlan();
  const { data: integrations } = useIntegrations();
  return {
    reached: atLimit(integrations?.length, plan.maxIntegrations),
    reason: `Your plan allows ${plan.maxIntegrations} integration${plan.maxIntegrations === 1 ? "" : "s"}.`,
  };
}
