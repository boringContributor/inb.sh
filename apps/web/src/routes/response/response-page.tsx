import { usePlan } from "../../lib/plan.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useBlocker, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, Switch, toast } from "@heroui/react";
import { ArrowLeft, Check } from "lucide-react";
import { type ResponseConfig, responseConfigSchema } from "@inb/shared";
import { api } from "../../lib/api.ts";
import { useConfig, useEndpoint, useUpdateEndpoint } from "../../lib/queries.ts";
import { Topbar } from "../../components/page.tsx";
import { RouteError } from "../errors.tsx";
import { ModeCards } from "./mode-cards.tsx";
import { DefinitionPanel } from "./definition-panel.tsx";
import { PreviewPanel, VariablesPanel } from "./preview-panel.tsx";
import { buildPreview, previewContext, sampleRequest } from "./preview.ts";

const sameConfig = (a: ResponseConfig, b: ResponseConfig) =>
  JSON.stringify(a) === JSON.stringify(b);

function parsesAsJson(text: string) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function ResponsePage() {
  const { endpointId } = useParams({ strict: false }) as { endpointId: string };
  const endpointQuery = useEndpoint(endpointId);
  const endpoint = endpointQuery.data;
  const { data: config } = useConfig();
  const { plan } = usePlan();
  const update = useUpdateEndpoint(endpointId);

  const [draft, setDraft] = useState<ResponseConfig | null>(null);
  const saved = endpoint?.response ?? null;

  // seed (and re-seed when switching endpoints) from the saved config
  useEffect(() => {
    if (saved) setDraft(structuredClone(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointId, saved === null]);

  const latest = useQuery({
    queryKey: ["response-preview-request", endpointId],
    queryFn: async () => {
      const page = await api.requests(endpointId, { limit: 1 });
      const first = page.items[0];
      return first ? api.request(endpointId, first.id) : null;
    },
    staleTime: 30_000,
  });

  const dirty = !!draft && !!saved && !sameConfig(draft, saved);
  const patch = (p: Partial<ResponseConfig>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const preview = useMemo(() => {
    if (!draft || !endpoint) return null;
    const request = latest.data ?? sampleRequest(endpoint);
    return buildPreview(draft, previewContext(request, endpoint, config?.captureBaseUrl ?? ""));
  }, [draft, endpoint, latest.data, config?.captureBaseUrl]);

  const bodyWarning = useMemo(() => {
    if (!draft || draft.mode === "proxy" || !/json/i.test(draft.contentType) || !draft.body.trim())
      return null;
    if (draft.mode === "static")
      return parsesAsJson(draft.body)
        ? null
        : "Body isn't valid JSON — it will be sent as written.";
    if (preview?.kind === "http" && preview.invalidJson)
      return "Rendered body isn't valid JSON for the preview request.";
    return null;
  }, [draft, preview]);

  const save = useCallback(() => {
    if (!draft || !dirty || update.isPending) return;
    const cleaned: ResponseConfig = {
      ...draft,
      headers: draft.headers.filter((h) => h.key.trim()),
    };
    const parsed = responseConfigSchema.safeParse(cleaned);
    if (!parsed.success) {
      toast.danger(parsed.error.issues[0]?.message ?? "Response settings are invalid");
      return;
    }
    if (cleaned.mode === "proxy" && cleaned.enabled && !cleaned.proxyUrl) {
      toast.danger("Proxy mode needs an upstream URL");
      return;
    }
    update.mutate(
      { response: parsed.data },
      {
        onSuccess: (ep) => {
          setDraft(structuredClone(ep.response));
          toast.success(
            ep.response.enabled ? "Custom response is live" : "Saved — custom response is off",
          );
        },
      },
    );
  }, [draft, dirty, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("You have unsaved response changes. Leave without saving?"),
    enableBeforeUnload: () => dirty,
  });

  if (endpointQuery.error)
    return <RouteError error={endpointQuery.error} reset={() => void endpointQuery.refetch()} />;

  const loading = !draft || !endpoint;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        left={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <RouterLink
              to="/e/$endpointId"
              params={{ endpointId }}
              aria-label="Back to inbox"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-default/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
            >
              <ArrowLeft className="size-4" />
            </RouterLink>
            {endpoint ? (
              <RouterLink
                to="/e/$endpointId"
                params={{ endpointId }}
                className="truncate text-tertiary hover:text-muted"
              >
                {endpoint.name}
              </RouterLink>
            ) : (
              <Skeleton className="h-4 w-28 rounded" />
            )}
            <span className="text-tertiary" aria-hidden>
              /
            </span>
            <span className="whitespace-nowrap font-semibold text-foreground" aria-current="page">
              Custom response
            </span>
          </nav>
        }
        right={
          <>
            <Switch
              isSelected={draft?.enabled ?? false}
              isDisabled={loading}
              onChange={(enabled) => patch({ enabled })}
            >
              <Switch.Content className="gap-3 text-[13px] text-foreground">
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Enabled
              </Switch.Content>
            </Switch>
            <div className="w-2" />
            <Button
              variant="ghost"
              className="text-muted"
              isDisabled={!dirty || update.isPending}
              onPress={() => saved && setDraft(structuredClone(saved))}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              isDisabled={!dirty}
              isPending={update.isPending}
              onPress={save}
              aria-keyshortcuts="Meta+S"
            >
              <Check className="size-4" />
              Save &amp; apply
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-5">
        <div className="flex w-full flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Respond on your terms</h1>
          <p className="max-w-[720px] text-[13px] leading-5 text-tertiary">
            Every request to this endpoint gets this reply — before it reaches anything else.
            Status, headers, latency and body are yours.
          </p>
        </div>

        {loading ? (
          <>
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[74px] flex-1 rounded-lg" />
              ))}
            </div>
            <div className="flex min-h-[520px] flex-1 gap-[18px] max-[1100px]:flex-col">
              <Skeleton className="flex-1 rounded-lg" />
              <Skeleton className="w-[400px] rounded-lg max-[1100px]:h-64 max-[1100px]:w-full" />
            </div>
          </>
        ) : (
          <>
            <ModeCards
              value={draft.mode}
              onChange={(mode) => patch({ mode })}
              disabled={
                plan.allowProxy
                  ? {}
                  : {
                      proxy: "Not available for guests — it would turn the URL into an open relay.",
                    }
              }
            />
            <div className="flex min-h-[520px] w-full flex-1 gap-[18px] max-[1100px]:flex-col">
              <DefinitionPanel draft={draft} onChange={patch} bodyWarning={bodyWarning} />
              <div className="flex w-[400px] shrink-0 flex-col gap-[18px] max-[1100px]:w-full">
                {preview && (
                  <PreviewPanel
                    preview={preview}
                    source={latest.data?.id ?? null}
                    loading={latest.isPending}
                    disabled={!draft.enabled}
                  />
                )}
                <VariablesPanel
                  template={draft.mode === "template"}
                  docsHref={config ? `https://github.com/${config.githubRepo}#templates` : null}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
