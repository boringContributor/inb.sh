import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Endpoint, RequestFilter, Rule, RuleInput, UpdateEndpointInput } from "@inb/shared";
import { toast } from "@heroui/react";
import { ApiError, api } from "./api.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (err) => toast.danger(err instanceof ApiError ? err.message : "Something went wrong"),
    },
  },
});

export const keys = {
  config: ["config"] as const,
  endpoints: ["endpoints"] as const,
  endpoint: (id: string) => ["endpoints", id] as const,
  requests: (id: string, filter: RequestFilter, q: string, order: "asc" | "desc") =>
    ["requests", id, { filter, q, order }] as const,
  requestsFor: (id: string) => ["requests", id] as const,
  request: (endpointId: string, requestId: string) => ["request", endpointId, requestId] as const,
  requestDeliveries: (endpointId: string, requestId: string) => ["request", endpointId, requestId, "deliveries"] as const,
  rules: ["rules"] as const,
  pipeline: ["pipeline"] as const,
  integrations: ["integrations"] as const,
  deliveries: (integrationId?: string) => ["deliveries", integrationId ?? "all"] as const,
  archive: ["archive"] as const,
  archived: (id: string) => ["archive", id] as const,
  settings: ["settings"] as const,
};

export const useConfig = () => useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: 60_000 });

export const useEndpoints = () => useQuery({ queryKey: keys.endpoints, queryFn: api.endpoints });

export function useEndpoint(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.endpoint(id),
    queryFn: () => api.endpoint(id),
    initialData: () => qc.getQueryData<Endpoint[]>(keys.endpoints)?.find((e) => e.id === id),
  });
}

export function useUpdateEndpoint(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEndpointInput) => api.updateEndpoint(id, input),
    onSuccess: (endpoint) => {
      qc.setQueryData(keys.endpoint(id), endpoint);
      qc.setQueryData<Endpoint[]>(keys.endpoints, (list) => list?.map((e) => (e.id === id ? endpoint : e)));
    },
  });
}

export function useRequest(endpointId: string, requestId: string | undefined) {
  return useQuery({
    queryKey: keys.request(endpointId, requestId ?? ""),
    queryFn: () => api.request(endpointId, requestId!),
    enabled: !!requestId,
    staleTime: 5_000,
  });
}

export const useRules = () => useQuery({ queryKey: keys.rules, queryFn: api.rules });
export const usePipeline = () => useQuery({ queryKey: keys.pipeline, queryFn: api.pipeline, refetchInterval: 30_000 });

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<RuleInput> }) =>
      id ? api.updateRule(id, input) : api.createRule(input as RuleInput),
    onSuccess: (rule) => {
      qc.setQueryData<Rule[]>(keys.rules, (list) => {
        if (!list) return [rule];
        return list.some((r) => r.id === rule.id) ? list.map((r) => (r.id === rule.id ? rule : r)) : [...list, rule];
      });
      void qc.invalidateQueries({ queryKey: keys.pipeline });
    },
  });
}

export const useIntegrations = () =>
  useQuery({ queryKey: keys.integrations, queryFn: api.integrations, refetchInterval: 30_000 });

export const useArchive = () => useQuery({ queryKey: keys.archive, queryFn: api.archive });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings });
