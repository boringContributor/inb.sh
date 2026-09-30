import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, Button, Skeleton, Tabs, Tooltip, toast } from "@heroui/react";
import { Archive, Braces, Trash } from "lucide-react";
import { formatBytes, formatRelative, requestToRaw } from "@inb/shared";
import { type ArchivedSummary, api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { keys, useArchive, useEndpoints } from "../../lib/queries.ts";
import { MethodBadge, StatusCode, StatusPill, TonePill } from "../../components/badges.tsx";
import { CodeView, CopyButton, prettyJson } from "../../components/code.tsx";
import { PageTitle, Panel, PanelHeader, Topbar } from "../../components/page.tsx";

function ArchiveRow({
  item,
  endpointName,
  selected,
  onSelect,
}: {
  item: ArchivedSummary;
  endpointName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "flex h-[68px] w-full shrink-0 border-b border-separator text-left outline-none transition-colors",
        "focus-visible:bg-surface",
        selected ? "bg-surface" : "hover:bg-surface/60",
      )}
    >
      <span className={cn("h-full w-0.5 shrink-0", selected ? "bg-accent" : "bg-transparent")} />
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-3 pl-2.5 pr-3">
        <span className="flex w-full items-center gap-2">
          <MethodBadge method={item.method} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              selected ? "font-medium text-foreground" : "text-muted",
            )}
          >
            {item.summary}
          </span>
          <StatusCode status={item.status} />
        </span>
        <span className="flex w-full items-center gap-1.5 text-[11px] text-tertiary">
          <span className="truncate">{endpointName}</span>
          <span>·</span>
          <span className="truncate font-mono">{item.path}</span>
          <span>·</span>
          <span className="whitespace-nowrap font-mono">{formatBytes(item.size)}</span>
          <span className="flex-1" />
          <span className="whitespace-nowrap">{formatRelative(item.archivedAt)}</span>
        </span>
      </span>
    </button>
  );
}

function ArchivedDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { data: req, isPending } = useQuery({
    queryKey: keys.archived(id),
    queryFn: () => api.archived(id),
  });
  const [tab, setTab] = useState("body");
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteArchived(id),
    onSuccess: () => {
      toast("Removed from archive");
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: keys.archive });
      onDeleted();
    },
  });

  if (isPending || !req) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-8 w-2/3 rounded-lg" />
        <Skeleton className="h-4 w-1/2 rounded-lg" />
        <Skeleton className="mt-4 h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const body =
    req.bodyEncoding === "utf8" ? prettyJson(req.body) : { text: req.body, isJson: false };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-separator px-5 pb-3.5 pt-4">
        <div className="flex items-center gap-2.5">
          <MethodBadge method={req.method} size="md" />
          <span className="truncate font-mono text-sm font-medium">{req.path}</span>
          <StatusPill status={req.status} />
          <span className="flex-1" />
          <Tooltip delay={400}>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Delete from archive"
              onPress={() => setConfirm(true)}
              className="text-muted"
            >
              <Trash className="size-4" />
            </Button>
            <Tooltip.Content>Delete from archive</Tooltip.Content>
          </Tooltip>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-tertiary">
          <span className="font-mono">{req.id}</span>
          <span>·</span>
          <span>received {new Date(req.receivedAt).toLocaleString()}</span>
          <span>·</span>
          <span className="font-mono">{formatBytes(req.size)}</span>
          {req.ip && (
            <>
              <span>·</span>
              <span className="font-mono">{req.ip}</span>
            </>
          )}
        </div>
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(k) => setTab(String(k))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-5 py-3">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Archived request">
              <Tabs.Tab id="body">
                Body
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="headers">
                Headers {req.headers.length}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="raw">
                Raw
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <Tabs.Panel id="body">
            <Panel>
              <PanelHeader icon={<Braces />} title="Request body">
                {req.contentType && (
                  <TonePill mono className="text-foreground">
                    {req.contentType.split(";")[0]}
                  </TonePill>
                )}
                <span className="flex-1" />
                <CopyButton text={body.text} label="Copy body" />
              </PanelHeader>
              <div className="border-t border-separator bg-background">
                {body.text ? (
                  <CodeView code={body.text} language={body.isJson ? "json" : "text"} />
                ) : (
                  <p className="px-4 py-6 text-sm text-tertiary">Empty body</p>
                )}
              </div>
            </Panel>
          </Tabs.Panel>
          <Tabs.Panel id="headers">
            <Panel>
              <table className="w-full text-left text-xs">
                <tbody>
                  {req.headers.map(([k, v], i) => (
                    <tr key={`${k}-${i}`} className="border-b border-separator last:border-0">
                      <td className="w-1/3 px-3.5 py-2 align-top font-mono text-code-key">{k}</td>
                      <td className="break-all px-3.5 py-2 font-mono text-foreground">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Tabs.Panel>
          <Tabs.Panel id="raw">
            <Panel>
              <div className="flex justify-end px-2 pt-2">
                <CopyButton text={requestToRaw(req)} label="Copy raw request" />
              </div>
              <CodeView code={requestToRaw(req)} language="http" wrap />
            </Panel>
          </Tabs.Panel>
        </div>
      </Tabs>

      <AlertDialog.Backdrop isOpen={confirm} onOpenChange={setConfirm}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[380px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete from archive?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">This archived copy is removed permanently.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button variant="danger" isPending={remove.isPending} onPress={() => remove.mutate()}>
                Delete
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}

export function ArchivePage() {
  const { data: items, isPending } = useArchive();
  const { data: endpoints } = useEndpoints();
  const search = useSearch({ strict: false }) as { r?: string };
  const navigate = useNavigate();
  const names = new Map(endpoints?.map((e) => [e.id, e.name]));
  const selected = search.r ?? items?.[0]?.id;
  const select = (r?: string) =>
    void navigate({ to: "/archive", search: r ? { r } : {}, replace: true });

  return (
    <>
      <Topbar
        left={
          <>
            <PageTitle>Archive</PageTitle>
            {!!items?.length && <TonePill>{items.length} kept</TonePill>}
          </>
        }
      />
      {!isPending && items?.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Archive className="size-6" />
          </span>
          <div className="max-w-md">
            <h2 className="text-xl font-semibold">Nothing archived yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Requests expire with their endpoint's retention. Add a rule with an “Archive” action,
              or use “Archive request” in the inspector, to keep a copy here for good.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[380px] shrink-0 flex-col border-r border-separator bg-background-secondary">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isPending &&
                Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="flex h-[68px] flex-col justify-center gap-2 border-b border-separator px-3"
                  >
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                ))}
              {items?.map((item) => (
                <ArchiveRow
                  key={item.id}
                  item={item}
                  endpointName={names.get(item.endpointId) ?? "Deleted endpoint"}
                  selected={item.id === selected}
                  onSelect={() => select(item.id)}
                />
              ))}
            </div>
            <div className="flex h-10 shrink-0 items-center border-t border-separator px-3 text-[11px] text-tertiary">
              {items
                ? `${items.length} archived request${items.length === 1 ? "" : "s"}`
                : "Loading…"}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <ArchivedDetail key={selected} id={selected} onDeleted={() => select()} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
