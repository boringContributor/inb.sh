import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@heroui/react";
import {
  ChevronRight,
  CircleAlert,
  Download,
  type LucideIcon,
  Reply,
  RotateCcw,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import {
  type CapturedRequest,
  type RequestEvent,
  type RequestEventType,
  formatClock,
  formatRelative,
} from "@inb/shared";
import { api } from "../../lib/api.ts";
import { keys, useIntegrations } from "../../lib/queries.ts";
import { cn } from "../../lib/cn.ts";
import { StatusCode } from "../../components/badges.tsx";

const EVENT_ICON: Record<RequestEventType, LucideIcon> = {
  received: Download,
  matched: SlidersHorizontal,
  responded: Reply,
  delivered: Send,
  delivery_failed: CircleAlert,
  replayed: RotateCcw,
};

const EVENT_TONE: Partial<Record<RequestEventType, string>> = {
  delivered: "text-success",
  delivery_failed: "text-danger",
};

function stepSub(e: RequestEvent) {
  return e.type === "received" ? formatClock(e.at) : e.detail;
}

/**
 * The compact pipeline strip under the body: one step per stage, using the
 * most recent event of each kind (a later failure or replay wins).
 */
export function PipelineStrip({ events }: { events: RequestEvent[] }) {
  const latest = (types: RequestEventType[]) =>
    [...events].reverse().find((e) => types.includes(e.type));
  const steps = [
    latest(["received"]),
    latest(["matched"]),
    latest(["responded"]),
    latest(["delivered", "delivery_failed"]),
    latest(["replayed"]),
  ].filter((e): e is RequestEvent => !!e);
  if (!steps.length) return null;

  return (
    <ol
      aria-label="Request pipeline"
      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-[18px] py-3.5"
    >
      {steps.map((e, i) => {
        const Icon = EVENT_ICON[e.type];
        return (
          <Fragment key={`${e.type}-${e.at}`}>
            {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-tertiary" />}
            <li className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  EVENT_TONE[e.type] ?? "text-muted",
                )}
              >
                <Icon className="size-[13px] shrink-0" />
                <span className="truncate">{e.label}</span>
              </span>
              <span className="truncate text-[10.5px] text-tertiary" title={stepSub(e)}>
                {stepSub(e)}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Full event history plus the delivery log for this request (Timeline tab). */
export function TimelineTab({
  endpointId,
  request,
}: {
  endpointId: string;
  request: CapturedRequest;
}) {
  const deliveries = useQuery({
    queryKey: keys.requestDeliveries(endpointId, request.id),
    queryFn: () => api.requestDeliveries(endpointId, request.id),
  });
  const { data: integrations } = useIntegrations();
  const nameOf = (id: string) => integrations?.find((i) => i.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-surface">
        <h3 className="flex h-11 items-center px-3.5 text-[13px] font-medium">Events</h3>
        <ol className="border-t border-separator bg-background px-3.5 py-3">
          {request.events.map((e, i) => {
            const Icon = EVENT_ICON[e.type];
            const last = i === request.events.length - 1;
            return (
              <li key={`${e.type}-${e.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-[11px] top-6 h-[calc(100%-20px)] w-px bg-separator-secondary"
                  />
                )}
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full bg-default",
                    EVENT_TONE[e.type] ?? "text-muted",
                  )}
                >
                  <Icon className="size-3" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        EVENT_TONE[e.type] ?? "text-foreground",
                      )}
                    >
                      {e.label}
                    </span>
                    <span className="font-mono text-[11px] text-tertiary">{formatClock(e.at)}</span>
                  </div>
                  <span className="break-words text-xs text-muted">{e.detail}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <h3 className="flex h-11 items-center px-3.5 text-[13px] font-medium">Deliveries</h3>
        <div className="border-t border-separator bg-background">
          {deliveries.isPending ? (
            <div className="flex flex-col gap-2 p-3.5">
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-4 w-1/2 rounded" />
            </div>
          ) : !deliveries.data?.length ? (
            <p className="px-3.5 py-4 text-xs text-tertiary">
              No integration deliveries for this request.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-tertiary">
                <tr>
                  <th className="px-3.5 py-2 font-medium">Integration</th>
                  <th className="px-3.5 py-2 font-medium">Status</th>
                  <th className="px-3.5 py-2 font-medium">Attempts</th>
                  <th className="px-3.5 py-2 font-medium">Duration</th>
                  <th className="px-3.5 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.map((d) => (
                  <tr key={d.id} className="border-t border-separator">
                    <td className="px-3.5 py-2 text-foreground">{nameOf(d.integrationId)}</td>
                    <td className="px-3.5 py-2">
                      {d.status ? (
                        <StatusCode status={d.status} />
                      ) : (
                        <span className="text-danger">error</span>
                      )}
                      {d.error && (
                        <span className="ml-2 text-danger" title={d.error}>
                          {d.error.slice(0, 60)}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-muted">{d.attempts}</td>
                    <td className="px-3.5 py-2 font-mono text-muted">
                      {d.durationMs !== null ? `${d.durationMs} ms` : "—"}
                    </td>
                    <td className="px-3.5 py-2 text-muted">{formatRelative(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
