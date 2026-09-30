import { useEffect, useRef, useState } from "react";
import { Button, SearchField, Skeleton, Tooltip } from "@heroui/react";
import { ArrowDownUp } from "lucide-react";
import {
  type RequestFilter,
  type RequestPage,
  type RequestSummary,
  formatBytes,
  formatRelative,
} from "@inb/shared";
import { MethodBadge, StatusCode } from "../../components/badges.tsx";
import { cn } from "../../lib/cn.ts";
import { useNow } from "./hooks.ts";

const FILTERS: { id: RequestFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "2xx", label: "2xx" },
  { id: "4xx", label: "4xx" },
  { id: "5xx", label: "5xx" },
  { id: "replayed", label: "Replayed" },
];

export function ListToolbar({
  query,
  onQueryChange,
  order,
  onToggleOrder,
  disabled,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  order: "asc" | "desc";
  onToggleOrder: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-[52px] w-full shrink-0 items-center gap-2 px-3">
      <SearchField
        aria-label="Filter requests"
        value={query}
        onChange={onQueryChange}
        isDisabled={disabled}
        fullWidth
        className="min-w-0 flex-1"
      >
        <SearchField.Group className="h-9 rounded-xl">
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Filter requests…" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <Tooltip delay={400}>
        <Button
          isIconOnly
          variant="ghost"
          aria-label={
            order === "desc"
              ? "Newest first — show oldest first"
              : "Oldest first — show newest first"
          }
          isDisabled={disabled}
          onPress={onToggleOrder}
          className={cn("size-9 min-w-9 rounded-lg text-muted", order === "asc" && "text-accent")}
        >
          <ArrowDownUp className="size-4" />
        </Button>
        <Tooltip.Content>{order === "desc" ? "Newest first" : "Oldest first"}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function FilterPills({
  filter,
  counts,
  onChange,
}: {
  filter: RequestFilter;
  counts: RequestPage["counts"] | undefined;
  onChange: (f: RequestFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Status filter"
      className="flex h-9 w-full shrink-0 items-center gap-1.5 overflow-x-auto px-3"
    >
      {FILTERS.map((f) => {
        const active = filter === f.id;
        const label =
          f.id === "all" && counts ? `All ${counts.all.toLocaleString("en-US")}` : f.label;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={counts ? `${counts[f.id].toLocaleString("en-US")} requests` : undefined}
            onClick={() => onChange(f.id)}
            className={cn(
              "inline-flex h-6 shrink-0 items-center justify-center rounded-sm px-2.5 text-[11.5px] font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-focus",
              active
                ? "bg-default text-foreground"
                : "border border-border text-tertiary hover:text-muted",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function RequestRow({
  request,
  selected,
  isNew,
  now,
  onSelect,
}: {
  request: RequestSummary;
  selected: boolean;
  isNew: boolean;
  now: number;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        data-request-id={request.id}
        className={cn(
          "flex h-[68px] w-full border-b border-separator text-left outline-none transition-colors",
          "focus-visible:bg-surface/60",
          selected ? "bg-surface" : "hover:bg-surface/50",
          isNew && !selected && "animate-flash",
        )}
      >
        <span
          className={cn("h-full w-0.5 shrink-0", selected ? "bg-accent" : "bg-transparent")}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3 pl-2.5 pr-3">
          <span className="flex w-full items-center gap-2">
            <MethodBadge method={request.method} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                selected ? "font-medium text-foreground" : "font-normal text-muted",
              )}
            >
              {request.summary}
            </span>
            {isNew && (
              <span className="shrink-0 rounded-sm bg-accent-soft px-1.5 py-px text-[9px] font-semibold tracking-[0.5px] text-accent">
                NEW
              </span>
            )}
            <StatusCode status={request.status} />
          </span>
          <span className="flex w-full items-center gap-1.5 text-[11px] text-tertiary">
            <span className="min-w-0 truncate font-mono">{request.path}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0 font-mono">{formatBytes(request.size)}</span>
            {request.replayCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">replayed {request.replayCount}×</span>
              </>
            )}
            <span className="flex-1" />
            <time dateTime={request.receivedAt} className="shrink-0 whitespace-nowrap">
              {formatRelative(request.receivedAt, now)}
            </time>
          </span>
        </span>
      </button>
    </li>
  );
}

export function RowSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex h-[68px] flex-col justify-center gap-2 border-b border-separator px-3.5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-10 rounded" />
            <div style={{ width: `${40 + ((i * 37) % 35)}%` }}>
              <Skeleton className="h-3 w-full rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-2.5 w-24 rounded" />
            <Skeleton className="h-2.5 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RequestList({
  items,
  counts,
  total,
  retentionDays,
  selectedId,
  newIds,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  order,
  onToggleOrder,
  onSelect,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  items: RequestSummary[];
  counts: RequestPage["counts"] | undefined;
  total: number;
  retentionDays: number;
  selectedId: string | undefined;
  newIds: Set<string>;
  filter: RequestFilter;
  onFilterChange: (f: RequestFilter) => void;
  query: string;
  onQueryChange: (q: string) => void;
  order: "asc" | "desc";
  onToggleOrder: () => void;
  onSelect: (id: string) => void;
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const now = useNow();
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !scrollRoot || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) onLoadMore();
      },
      { root: scrollRoot, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot, hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <section
      aria-label="Requests"
      className="flex h-full w-[320px] shrink-0 flex-col border-r border-separator bg-background-secondary xl:w-[380px]"
    >
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        order={order}
        onToggleOrder={onToggleOrder}
      />
      <FilterPills filter={filter} counts={counts} onChange={onFilterChange} />
      <div className="h-px w-full shrink-0 bg-separator" />
      <div ref={setScrollRoot} className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <RowSkeletons />
        ) : isError ? (
          <p className="px-4 py-6 text-sm text-danger">
            Couldn't load requests. They'll reappear when the connection is back.
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col gap-1 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No matching requests</p>
            <p className="text-xs text-tertiary">
              {query ? `Nothing matches “${query}”.` : "Nothing in this filter yet."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((r) => (
              <RequestRow
                key={r.id}
                request={r}
                selected={r.id === selectedId}
                isNew={newIds.has(r.id)}
                now={now}
                onSelect={() => onSelect(r.id)}
              />
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-px" />
        {isFetchingNextPage && <RowSkeletons count={2} />}
      </div>
      <footer className="flex h-10 w-full shrink-0 items-center gap-2 border-t border-separator px-3 text-[11px] text-tertiary">
        <span className="flex-1">
          {items.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")} requests
        </span>
        <span className="whitespace-nowrap">{retentionDays}-day retention</span>
      </footer>
    </section>
  );
}
