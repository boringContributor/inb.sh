import type {
  AppConfig,
  CapturedRequest,
  CreateEndpointInput,
  Delivery,
  DryRunResult,
  Endpoint,
  Integration,
  IntegrationInput,
  PipelineStats,
  RequestFilter,
  RequestPage,
  RequestSummary,
  Rule,
  RuleInput,
  UpdateEndpointInput,
} from "@inb/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string };
    if (res.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("inb:unauthorized"));
    throw new ApiError(
      res.status,
      err.error ?? "error",
      err.message ?? err.error ?? res.statusText,
      data,
    );
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

export interface ReplayResult {
  ok: boolean;
  status: number | null;
  durationMs: number;
  error: string | null;
}

export type ArchivedSummary = RequestSummary & { archivedAt: string };

export const api = {
  config: () => get<AppConfig>("/config"),
  login: (password: string) => post<{ ok: true }>("/auth/login", { password }),
  logout: () => post<{ ok: true }>("/auth/logout"),

  endpoints: () => get<Endpoint[]>("/endpoints"),
  endpoint: (id: string) => get<Endpoint>(`/endpoints/${id}`),
  createEndpoint: (input: CreateEndpointInput) => post<Endpoint>("/endpoints", input),
  updateEndpoint: (id: string, input: UpdateEndpointInput) =>
    patch<Endpoint>(`/endpoints/${id}`, input),
  deleteEndpoint: (id: string) => del<{ ok: true }>(`/endpoints/${id}`),

  requests: (
    endpointId: string,
    params: {
      filter?: RequestFilter;
      q?: string;
      cursor?: string | null;
      order?: "asc" | "desc";
      limit?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params.filter && params.filter !== "all") qs.set("filter", params.filter);
    if (params.q) qs.set("q", params.q);
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.order) qs.set("order", params.order);
    if (params.limit) qs.set("limit", String(params.limit));
    return get<RequestPage>(`/endpoints/${endpointId}/requests?${qs}`);
  },
  request: (endpointId: string, requestId: string) =>
    get<CapturedRequest>(`/endpoints/${endpointId}/requests/${requestId}`),
  requestDeliveries: (endpointId: string, requestId: string) =>
    get<Delivery[]>(`/endpoints/${endpointId}/requests/${requestId}/deliveries`),
  clearRequests: (endpointId: string) => del<{ ok: true }>(`/endpoints/${endpointId}/requests`),
  replay: (endpointId: string, requestId: string, input: { url: string; transform?: string }) =>
    post<ReplayResult>(`/endpoints/${endpointId}/requests/${requestId}/replay`, input),
  reportReplay: (
    endpointId: string,
    requestId: string,
    input: { url: string; status: number | null },
  ) => post<RequestSummary>(`/endpoints/${endpointId}/requests/${requestId}/replayed`, input),
  archiveRequest: (endpointId: string, requestId: string) =>
    post<{ ok: true }>(`/endpoints/${endpointId}/requests/${requestId}/archive`),

  rules: () => get<Rule[]>("/rules"),
  createRule: (input: RuleInput) => post<Rule>("/rules", input),
  updateRule: (id: string, input: Partial<RuleInput>) => patch<Rule>(`/rules/${id}`, input),
  deleteRule: (id: string) => del<{ ok: true }>(`/rules/${id}`),
  reorderRules: (ids: string[]) => post<{ ok: true }>("/rules/reorder", { ids }),
  dryRun: (input: { rule: RuleInput; endpointId?: string; requestId?: string }) =>
    post<DryRunResult>("/rules/dry-run", input),
  pipeline: () => get<PipelineStats>("/pipeline"),

  integrations: () => get<Integration[]>("/integrations"),
  createIntegration: (input: IntegrationInput) => post<Integration>("/integrations", input),
  updateIntegration: (id: string, input: Partial<Omit<IntegrationInput, "kind">>) =>
    patch<Integration>(`/integrations/${id}`, input),
  deleteIntegration: (id: string) => del<{ ok: true }>(`/integrations/${id}`),
  testIntegration: (id: string) => post<ReplayResult>(`/integrations/${id}/test`),
  deliveries: (params: { integrationId?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.integrationId) qs.set("integrationId", params.integrationId);
    if (params.limit) qs.set("limit", String(params.limit));
    return get<Delivery[]>(`/deliveries?${qs}`);
  },

  archive: () => get<ArchivedSummary[]>("/archive"),
  archived: (id: string) => get<CapturedRequest>(`/archive/${id}`),
  deleteArchived: (id: string) => del<{ ok: true }>(`/archive/${id}`),

  cliToken: () => get<{ token: string | null }>("/cli-token"),
  settings: () => get<{ workspaceName: string; userName: string }>("/settings"),
  updateSettings: (input: { workspaceName?: string; userName?: string }) =>
    patch<{ ok: true }>("/settings", input),
};

export function liveSocketUrl(endpointId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/endpoints/${endpointId}/live`;
}
