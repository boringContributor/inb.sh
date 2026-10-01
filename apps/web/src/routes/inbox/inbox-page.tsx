import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Skeleton, Tooltip } from "@heroui/react";
import { Code, Hourglass, Pause, Play, Share2 } from "lucide-react";
import { type Endpoint, type RequestFilter, type RequestSummary, formatUntil } from "@inb/shared";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { type LiveStatus, useLiveRequests } from "../../lib/live.ts";
import { keys, useConfig, useEndpoint } from "../../lib/queries.ts";
import { LiveDot } from "../../components/badges.tsx";
import { CopyButton, useCopy } from "../../components/code.tsx";
import { PageTitle, Topbar } from "../../components/page.tsx";
import { EndpointMenu } from "./endpoint-menu.tsx";
import { FirstRequestStage, WaitingList } from "./first-request.tsx";
import { Inspector } from "./inspector.tsx";
import { RequestList, RowSkeletons } from "./request-list.tsx";
import { isTypingTarget, useDebounced } from "./hooks.ts";

const PAGE_SIZE = 50;

function LiveChip({ status, waiting }: { status: LiveStatus; waiting: boolean }) {
  const view = {
    live: {
      label: waiting ? "Listening" : "Live",
      cls: "bg-signal-soft text-signal",
      tone: "signal" as const,
    },
    connecting: {
      label: "Connecting",
      cls: "bg-warning-soft text-warning",
      tone: "warning" as const,
    },
    offline: { label: "Offline", cls: "bg-danger-soft text-danger", tone: "danger" as const },
  }[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 font-mono text-[10px] font-medium uppercase tracking-[0.9px]",
        view.cls,
      )}
    >
      <LiveDot tone={view.tone} pulse={status !== "offline"} />
      {view.label}
    </span>
  );
}

function UrlPill({ url }: { url: string }) {
  return (
    <div className="hidden h-[30px] min-w-0 items-center gap-2 rounded-sm border border-border bg-surface pl-3 pr-1 md:flex">
      <span className="min-w-0 truncate font-mono text-xs text-muted" title={url}>
        {url}
      </span>
      <CopyButton text={url} label="Copy endpoint URL" className="size-6 min-w-6 rounded-lg" />
    </div>
  );
}

export function InboxPage() {
  const { endpointId } = useParams({ from: "/app/e/$endpointId" });
  const search = useSearch({ from: "/app/e/$endpointId" });
  const navigate = useNavigate({ from: "/e/$endpointId" });
  const filter: RequestFilter = search.filter ?? "all";
  const { data: endpoint, isError: endpointError } = useEndpoint(endpointId);
  const { data: config } = useConfig();
  const { copy } = useCopy();

  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [paused, setPaused] = useState(false);
  const [queryInput, setQueryInput] = useState(search.q ?? "");
  const q = useDebounced(queryInput.trim(), 250);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());

  // reset per-endpoint UI state when switching endpoints
  useEffect(() => {
    setPaused(false);
    setNewIds(new Set());
    setQueryInput(search.q ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointId]);

  useEffect(() => {
    if ((search.q ?? "") !== q)
      void navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onLiveRequest = useCallback((r: RequestSummary) => {
    setNewIds((prev) => new Set(prev).add(r.id));
  }, []);
  const live = useLiveRequests(endpointId, { paused, onRequest: onLiveRequest });

  const requests = useInfiniteQuery({
    queryKey: keys.requests(endpointId, filter, q, order),
    queryFn: ({ pageParam }) =>
      api.requests(endpointId, { filter, q, order, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // the socket pushes new requests; poll only while it's down
    refetchInterval: live.status === "live" || paused ? false : 5_000,
  });

  const items = useMemo(() => requests.data?.pages.flatMap((p) => p.items) ?? [], [requests.data]);
  const firstPage = requests.data?.pages[0];
  const waiting = !!firstPage && firstPage.counts.all === 0 && filter === "all" && !q;
  const selectedId = search.r;

  const select = useCallback(
    (id: string, replace = false) => {
      setNewIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void navigate({ search: (s) => ({ ...s, r: id }), replace });
    },
    [navigate],
  );

  // nothing selected (or selection filtered away on first load) → newest
  useEffect(() => {
    if (!selectedId && items[0]) select(items[0].id, true);
  }, [selectedId, items, select]);

  // j/k and arrow keys walk the list
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const down = e.key === "j" || e.key === "ArrowDown";
      const up = e.key === "k" || e.key === "ArrowUp";
      if (!down && !up) return;
      if (
        (e.target as HTMLElement | null)?.closest(
          '[role="tablist"],[role="menu"],[role="listbox"],[role="dialog"]',
        )
      )
        return;
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === selectedId);
      const next = items[Math.max(0, Math.min(items.length - 1, idx + (down ? 1 : -1)))];
      if (next && next.id !== selectedId) select(next.id, true);
      if (down && idx >= items.length - 3 && requests.hasNextPage && !requests.isFetchingNextPage)
        void requests.fetchNextPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, select, requests]);

  if (endpointError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">This endpoint doesn't exist anymore</p>
        <Button variant="secondary" onPress={() => void navigate({ to: "/" })}>
          Back to the inbox
        </Button>
      </div>
    );
  }

  const url = endpoint && config ? `${config.captureBaseUrl}/${endpoint.slug}` : "";

  const shareLink = () => {
    const link = new URL(`/e/${endpointId}`, location.origin);
    if (selectedId) link.searchParams.set("r", selectedId);
    void copy(link.toString(), "Link to this request copied");
  };

  return (
    <>
      <Topbar
        left={
          endpoint ? (
            <>
              <PageTitle>{endpoint.name}</PageTitle>
              {url && <UrlPill url={url} />}
            </>
          ) : (
            <Skeleton className="h-5 w-48 rounded" />
          )
        }
        right={
          <>
            {endpoint && <ExpiryChip endpoint={endpoint} />}
            <LiveChip status={live.status} waiting={waiting} />
            {!waiting && (
              <Tooltip delay={400}>
                <Button
                  variant="ghost"
                  isIconOnly={!(paused && live.buffered)}
                  aria-label={paused ? "Resume live updates" : "Pause live updates"}
                  aria-pressed={paused}
                  onPress={() => setPaused((p) => !p)}
                  className={cn("h-9 min-w-9 rounded-lg text-muted", paused && "text-warning")}
                >
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                  {paused && live.buffered > 0 && (
                    <span className="text-xs font-medium">{live.buffered} new</span>
                  )}
                </Button>
                <Tooltip.Content>
                  {paused ? "Resume — show new requests" : "Pause the live list"}
                </Tooltip.Content>
              </Tooltip>
            )}
            <Button
              variant="outline"
              className="h-9 rounded-lg"
              onPress={() =>
                void navigate({ to: "/e/$endpointId/response", params: { endpointId } })
              }
            >
              <Code className="size-4" />
              Custom response
            </Button>
            {!waiting && (
              <Tooltip delay={400}>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label="Copy link to this request"
                  onPress={shareLink}
                  className="size-9 min-w-9 rounded-lg text-muted"
                >
                  <Share2 className="size-4" />
                </Button>
                <Tooltip.Content>Copy link</Tooltip.Content>
              </Tooltip>
            )}
            {endpoint && <EndpointMenu endpoint={endpoint} />}
          </>
        }
      />
      <div className="flex min-h-0 w-full flex-1">
        {requests.isPending || !endpoint ? (
          <>
            <section className="flex h-full w-[320px] shrink-0 flex-col border-r border-separator bg-background-secondary xl:w-[380px]">
              <div className="h-[88px] shrink-0" />
              <RowSkeletons />
            </section>
            <div className="flex-1" />
          </>
        ) : waiting ? (
          <>
            <WaitingList
              order={order}
              onToggleOrder={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
            />
            <FirstRequestStage endpointId={endpointId} url={url} />
          </>
        ) : (
          <>
            <RequestList
              items={items}
              counts={firstPage?.counts}
              total={firstPage?.total ?? 0}
              retentionDays={endpoint.retentionDays}
              selectedId={selectedId}
              newIds={newIds}
              filter={filter}
              onFilterChange={(f) =>
                void navigate({
                  search: (s) => ({ ...s, filter: f === "all" ? undefined : f, r: undefined }),
                  replace: true,
                })
              }
              query={queryInput}
              onQueryChange={setQueryInput}
              order={order}
              onToggleOrder={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
              onSelect={(id) => select(id)}
              isPending={false}
              isError={requests.isError}
              hasNextPage={requests.hasNextPage}
              isFetchingNextPage={requests.isFetchingNextPage}
              onLoadMore={() => void requests.fetchNextPage()}
            />
            <Inspector
              endpoint={endpoint}
              requestId={selectedId}
              captureBaseUrl={config?.captureBaseUrl ?? ""}
            />
          </>
        )}
      </div>
    </>
  );
}

/** Guests: when the endpoint disappears, and how much of today's quota is used. */
function ExpiryChip({ endpoint }: { endpoint: Endpoint }) {
  const { today, dailyLimit } = endpoint.usage;
  if (!endpoint.expiresAt && dailyLimit === null) return null;
  const nearLimit = dailyLimit !== null && today >= dailyLimit * 0.9;
  return (
    <Tooltip delay={300}>
      <span
        tabIndex={0}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus",
          nearLimit ? "bg-warning-soft text-warning" : "bg-default text-muted",
        )}
      >
        <Hourglass className="size-3.5" />
        {endpoint.expiresAt
          ? `Expires ${formatUntil(endpoint.expiresAt)}`
          : `${today}/${dailyLimit}`}
      </span>
      <Tooltip.Content className="max-w-64">
        {endpoint.expiresAt &&
          `This endpoint and its history are deleted ${formatUntil(endpoint.expiresAt)}. `}
        {dailyLimit !== null &&
          `${today.toLocaleString("en-US")} of ${dailyLimit.toLocaleString("en-US")} requests used today (resets at midnight UTC).`}
      </Tooltip.Content>
    </Tooltip>
  );
}
