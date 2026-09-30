import { useQuery } from "@tanstack/react-query";
import { Drawer, Skeleton } from "@heroui/react";
import { formatRelative, type Integration, integrationDefinition } from "@inb/shared";
import { api } from "../../lib/api.ts";
import { keys } from "../../lib/queries.ts";
import { StatusCode } from "../../components/badges.tsx";
import { iconByName } from "../../components/icons.tsx";

export function DeliveryLog({
  isOpen,
  onOpenChange,
  integrations,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  integrations: Integration[];
}) {
  const { data, isPending } = useQuery({
    queryKey: keys.deliveries(),
    queryFn: () => api.deliveries({ limit: 100 }),
    enabled: isOpen,
    refetchInterval: isOpen ? 10_000 : false,
  });
  const byId = new Map(integrations.map((i) => [i.id, i]));

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right" className="w-full max-w-[520px]">
        <Drawer.Dialog className="flex h-full flex-col">
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>Delivery log</Drawer.Heading>
            <p className="text-sm text-muted">The last 100 deliveries across all integrations.</p>
          </Drawer.Header>
          <Drawer.Body className="min-h-0 flex-1 overflow-y-auto p-0">
            {isPending && (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            )}
            {data?.length === 0 && (
              <p className="px-6 py-10 text-center text-sm text-muted">
                No deliveries yet. Rules with a “Forward” action send matched requests here.
              </p>
            )}
            <ul className="divide-y divide-separator">
              {data?.map((d) => {
                const integration = byId.get(d.integrationId);
                const Icon = integration ? iconByName(integrationDefinition(integration.kind).icon) : null;
                return (
                  <li key={d.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-background-secondary text-muted">
                      {Icon && <Icon className="size-3.5" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{integration?.name ?? "Removed integration"}</span>
                        {d.status !== null ? (
                          <StatusCode status={d.status} />
                        ) : (
                          <span className="font-mono text-xs font-semibold text-danger">ERR</span>
                        )}
                        <span className="flex-1" />
                        <span className="text-[11px] text-tertiary">{formatRelative(d.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-tertiary">
                        <span className="truncate">{d.requestId}</span>
                        {d.durationMs !== null && <span>· {d.durationMs} ms</span>}
                        {d.attempts > 1 && <span>· {d.attempts} attempts</span>}
                      </div>
                      {d.error && <p className="break-words text-[11.5px] text-danger">{d.error}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
