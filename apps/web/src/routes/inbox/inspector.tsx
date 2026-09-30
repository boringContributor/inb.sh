import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Dropdown, Input, Label, Skeleton, Tooltip, toast } from "@heroui/react";
import {
  Archive,
  Braces,
  Download,
  Ellipsis,
  FingerprintPattern,
  Pencil,
  Reply,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  TextWrap,
} from "lucide-react";
import {
  type CapturedRequest,
  type Endpoint,
  type ResponseSource,
  type Tone,
  formatBytes,
  formatRelative,
  requestToCurl,
  requestToRaw,
} from "@inb/shared";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { useRequest } from "../../lib/queries.ts";
import { MethodBadge, StatusPill, TonePill } from "../../components/badges.tsx";
import { CodeView, CopyButton, prettyJson, useCopy } from "../../components/code.tsx";
import { PillTabs } from "../../components/pill-tabs.tsx";
import { PipelineStrip, TimelineTab } from "./timeline.tsx";
import { ReplayModal, TransformReplayModal } from "./replay.tsx";
import { downloadFile, base64ToBytes, useNow } from "./hooks.ts";

type TabId = "body" | "headers" | "query" | "raw" | "curl" | "timeline";

const SOURCE: Record<ResponseSource, { label: string; tone: Tone }> = {
  custom: { label: "Custom", tone: "accent" },
  rule: { label: "Rule", tone: "warning" },
  proxy: { label: "Proxy", tone: "accent" },
  default: { label: "Default", tone: "default" },
};

function ToolButton({
  label,
  onPress,
  active,
  children,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={label}
        aria-pressed={active}
        onPress={onPress}
        className={cn(
          "size-9 min-w-9 rounded-3xl",
          active ? "bg-default text-foreground" : "text-muted",
        )}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-surface",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 w-full items-center gap-2 pl-3.5 pr-2.5">
      <span className="text-muted [&>svg]:size-3.5">{icon}</span>
      <h2 className="whitespace-nowrap text-[13px] font-medium text-foreground">{title}</h2>
      {children}
    </div>
  );
}

function KeyValueTable({
  rows,
  empty,
  highlight,
}: {
  rows: [string, string][];
  empty: string;
  highlight?: string;
}) {
  if (!rows.length) return <p className="px-3.5 py-4 text-xs text-tertiary">{empty}</p>;
  const h = highlight?.toLowerCase();
  return (
    <table className="w-full table-fixed border-collapse font-mono text-xs">
      <tbody>
        {rows.map(([k, v], i) => {
          const hit = h && (k.toLowerCase().includes(h) || v.toLowerCase().includes(h));
          return (
            <tr
              key={`${k}-${i}`}
              className={cn(
                "group border-t border-separator first:border-t-0",
                hit && "bg-warning/10",
              )}
            >
              <td className="w-[34%] truncate px-3.5 py-2 align-top text-code-key" title={k}>
                {k}
              </td>
              <td className="break-all px-3.5 py-2 align-top text-foreground">{v}</td>
              <td className="w-10 pr-2 align-top">
                <CopyButton
                  text={v}
                  label={`Copy ${k}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BodyCard({
  request,
  wrap,
  highlight,
}: {
  request: CapturedRequest;
  wrap: boolean;
  highlight: string;
}) {
  const [pretty, setPretty] = useState(true);
  const binary = request.bodyEncoding === "base64";
  const formatted = useMemo(
    () => (binary ? null : prettyJson(request.body)),
    [binary, request.body],
  );
  const text = formatted ? (pretty && formatted.isJson ? formatted.text : request.body) : "";

  return (
    <Card>
      <CardHeader icon={<Braces />} title="Request body">
        {request.contentType && (
          <span className="truncate rounded-2xl bg-default px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
            {request.contentType.split(";")[0]}
          </span>
        )}
        <span className="flex-1" />
        {formatted?.isJson && (
          <button
            type="button"
            onClick={() => setPretty((p) => !p)}
            className="rounded px-1 text-[11.5px] font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
          >
            {pretty ? "Pretty" : "Raw"}
          </button>
        )}
        {!binary && request.body && <CopyButton text={request.body} label="Copy body" />}
      </CardHeader>
      <div className="border-t border-separator bg-background">
        {binary ? (
          <div className="flex items-center justify-between gap-3 px-3.5 py-4 text-xs text-muted">
            <span>Binary body · {formatBytes(request.size)}</span>
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                downloadFile(
                  `${request.id}.bin`,
                  base64ToBytes(request.body),
                  request.contentType ?? "application/octet-stream",
                )
              }
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        ) : !request.body ? (
          <p className="px-3.5 py-4 text-xs text-tertiary">No body</p>
        ) : (
          <CodeView
            code={text}
            language={formatted?.isJson ? "json" : "text"}
            wrap={wrap}
            highlight={highlight || undefined}
            className="max-h-[60vh]"
          />
        )}
        {request.bodyTruncated && (
          <p className="border-t border-separator px-3.5 py-2 text-[11px] text-warning">
            Stored body truncated at 1 MB — the full body was still forwarded.
          </p>
        )}
      </div>
    </Card>
  );
}

function ResponseCard({ request, onEdit }: { request: CapturedRequest; onEdit: () => void }) {
  const { response } = request;
  const source = SOURCE[response.source];
  const pretty = prettyJson(response.body);
  return (
    <Card>
      <CardHeader icon={<Reply />} title="Response sent">
        <StatusPill status={response.status} />
        <TonePill tone={source.tone} className="text-xs">
          {source.label}
        </TonePill>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-tertiary">{response.durationMs} ms</span>
        <Tooltip delay={400}>
          <Button
            isIconOnly
            variant="ghost"
            aria-label="Edit custom response"
            onPress={onEdit}
            className="size-7 min-w-7 text-muted"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Tooltip.Content>Edit custom response</Tooltip.Content>
        </Tooltip>
      </CardHeader>
      <div className="flex flex-col gap-1 border-t border-separator bg-background px-3.5 py-3 font-mono text-xs leading-[18px]">
        {response.headers.map(([k, v], i) => (
          <div key={`${k}-${i}`} className="flex min-w-0 gap-1">
            <span className="shrink-0 text-code-key">{k}:</span>
            <span className="break-all text-code-string">{v}</span>
          </div>
        ))}
        {response.body && (
          <CodeView
            code={pretty.isJson ? JSON.stringify(JSON.parse(response.body)) : response.body}
            language={pretty.isJson ? "json" : "text"}
            lineNumbers={false}
            wrap
            className="-mx-3.5 max-h-60 py-0"
          />
        )}
      </div>
    </Card>
  );
}

function InspectorSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-14 rounded-md" />
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-5 w-16 rounded-2xl" />
      </div>
      <Skeleton className="h-3 w-80 rounded" />
      <Skeleton className="h-9 w-[420px] rounded-[20px]" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

export function Inspector({
  endpoint,
  requestId,
  captureBaseUrl,
}: {
  endpoint: Endpoint;
  requestId: string | undefined;
  captureBaseUrl: string;
}) {
  const { data: request, isPending, isError, error } = useRequest(endpoint.id, requestId);
  const [tab, setTab] = useState<TabId>("body");
  const [wrap, setWrap] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const navigate = useNavigate();
  const { copy } = useCopy();
  const now = useNow();

  if (!requestId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-tertiary">
        Select a request to inspect it
      </div>
    );
  }
  if (isPending) return <InspectorSkeleton />;
  if (isError || !request) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">This request is no longer available</p>
        <p className="text-xs text-tertiary">
          {error?.message ?? "It may have expired after the retention window."}
        </p>
      </div>
    );
  }

  const endpointUrl = `${captureBaseUrl}/${endpoint.slug}`;
  const download = () => downloadFile(`${request.id}.json`, JSON.stringify(request, null, 2));
  const editResponse = () =>
    void navigate({ to: "/e/$endpointId/response", params: { endpointId: endpoint.id } });

  const tabs: { id: TabId; label: string }[] = [
    { id: "body", label: "Body" },
    { id: "headers", label: `Headers ${request.headers.length}` },
    { id: "query", label: `Query ${request.query.length}` },
    { id: "raw", label: "Raw" },
    { id: "curl", label: "cURL" },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <section aria-label="Request inspector" className="flex min-w-0 flex-1 flex-col">
      <div className="flex w-full shrink-0 flex-col gap-2.5 border-b border-separator px-5 pb-3.5 pt-4">
        <div className="flex w-full min-w-0 items-center gap-2.5">
          <MethodBadge method={request.method} size="md" />
          <h2
            className="min-w-0 truncate font-mono text-sm font-medium text-foreground"
            title={request.path}
          >
            {request.path}
          </h2>
          <StatusPill status={request.status} />
          <span className="flex-1" />
          <Button onPress={() => setReplaying(true)} className="h-9 rounded-3xl">
            <RotateCcw className="size-4" />
            Replay
          </Button>
          <Button
            variant="outline"
            onPress={() => setTransforming(true)}
            className="hidden h-9 rounded-3xl lg:inline-flex"
          >
            <Sparkles className="size-4" />
            Transform &amp; replay
          </Button>
          <ToolButton
            label="Copy as cURL"
            onPress={() => copy(requestToCurl(request, endpointUrl), "cURL command copied")}
          >
            <Terminal className="size-4" />
          </ToolButton>
          <Dropdown>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="More request actions"
              className="size-9 min-w-9 rounded-3xl text-muted"
            >
              <Ellipsis className="size-4" />
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-52">
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === "transform") setTransforming(true);
                  if (key === "copy-id") void copy(request.id, "Request id copied");
                  if (key === "download") download();
                  if (key === "archive") {
                    void api
                      .archiveRequest(endpoint.id, request.id)
                      .then(() => toast.success("Request archived — it stays after retention"))
                      .catch(() => toast.danger("Couldn't archive the request"));
                  }
                }}
              >
                <Dropdown.Item id="transform" textValue="Transform & replay" className="lg:hidden">
                  <Sparkles className="size-4 text-muted" />
                  <Label>Transform &amp; replay</Label>
                </Dropdown.Item>
                <Dropdown.Item id="archive" textValue="Archive request">
                  <Archive className="size-4 text-muted" />
                  <Label>Archive request</Label>
                </Dropdown.Item>
                <Dropdown.Item id="copy-id" textValue="Copy request id">
                  <FingerprintPattern className="size-4 text-muted" />
                  <Label>Copy request id</Label>
                </Dropdown.Item>
                <Dropdown.Item id="download" textValue="Download JSON">
                  <Download className="size-4 text-muted" />
                  <Label>Download JSON</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 text-[11.5px] text-tertiary">
          <span className="truncate font-mono">{request.id}</span>
          <span aria-hidden>·</span>
          <time
            dateTime={request.receivedAt}
            title={new Date(request.receivedAt).toLocaleString()}
            className="whitespace-nowrap"
          >
            {formatRelative(request.receivedAt, now)}
          </time>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap font-mono">{request.response.durationMs} ms</span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap font-mono">{formatBytes(request.size)}</span>
          {request.ip && (
            <>
              <span aria-hidden>·</span>
              <span
                className="truncate font-mono"
                title={request.country ? `${request.ip} (${request.country})` : request.ip}
              >
                {request.ip}
              </span>
            </>
          )}
          <span className="flex-1" />
          {request.signature &&
            (request.signature.verified ? (
              <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-success-soft px-[9px] py-[3px] text-[11px] font-medium text-success">
                <ShieldCheck className="size-3" />
                Signature verified
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-danger-soft px-[9px] py-[3px] text-[11px] font-medium text-danger">
                <ShieldAlert className="size-3" />
                Signature invalid
              </span>
            ))}
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 px-5 py-3">
        <div className="min-w-0 overflow-x-auto">
          <PillTabs
            items={tabs}
            selectedKey={tab}
            onSelectionChange={setTab}
            ariaLabel="Request sections"
          />
        </div>
        <span className="flex-1" />
        {searching && (
          <Input
            aria-label="Search in request"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                setSearching(false);
              }
            }}
            placeholder="Find…"
            className="h-9 w-40"
          />
        )}
        <ToolButton
          label={wrap ? "Disable line wrap" : "Wrap lines"}
          active={wrap}
          onPress={() => setWrap((w) => !w)}
        >
          <TextWrap className="size-4" />
        </ToolButton>
        <ToolButton
          label="Search in request"
          active={searching}
          onPress={() => {
            setSearching((s) => !s);
            if (searching) setSearch("");
          }}
        >
          <Search className="size-4" />
        </ToolButton>
        <ToolButton label="Download JSON" onPress={download}>
          <Download className="size-4" />
        </ToolButton>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
        {tab === "body" && (
          <>
            <BodyCard request={request} wrap={wrap} highlight={search} />
            <ResponseCard request={request} onEdit={editResponse} />
            <PipelineStrip events={request.events} />
          </>
        )}
        {tab === "headers" && (
          <Card>
            <CardHeader icon={<Braces />} title="Request headers">
              <span className="flex-1" />
              <CopyButton
                text={request.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}
                label="Copy headers"
              />
            </CardHeader>
            <div className="border-t border-separator bg-background">
              <KeyValueTable rows={request.headers} empty="No headers" highlight={search} />
            </div>
          </Card>
        )}
        {tab === "query" && (
          <Card>
            <CardHeader icon={<Braces />} title="Query parameters" />
            <div className="border-t border-separator bg-background">
              <KeyValueTable rows={request.query} empty="No query parameters" highlight={search} />
            </div>
          </Card>
        )}
        {tab === "raw" && (
          <Card>
            <CardHeader icon={<Braces />} title="Raw HTTP">
              <span className="flex-1" />
              <CopyButton text={requestToRaw(request)} label="Copy raw request" />
            </CardHeader>
            <div className="border-t border-separator bg-background">
              <CodeView
                code={requestToRaw(request)}
                language="http"
                wrap={wrap}
                highlight={search || undefined}
              />
            </div>
          </Card>
        )}
        {tab === "curl" && (
          <Card>
            <CardHeader icon={<Terminal />} title="cURL">
              <span className="flex-1" />
              <CopyButton text={requestToCurl(request, endpointUrl)} label="Copy cURL" />
            </CardHeader>
            <div className="border-t border-separator bg-background">
              <CodeView
                code={requestToCurl(request, endpointUrl)}
                language="shell"
                wrap={wrap}
                highlight={search || undefined}
              />
            </div>
          </Card>
        )}
        {tab === "timeline" && <TimelineTab endpointId={endpoint.id} request={request} />}
      </div>

      <ReplayModal
        key={`r-${request.id}`}
        endpointId={endpoint.id}
        request={request}
        isOpen={replaying}
        onOpenChange={setReplaying}
      />
      <TransformReplayModal
        key={`t-${request.id}`}
        endpointId={endpoint.id}
        request={request}
        isOpen={transforming}
        onOpenChange={setTransforming}
      />
    </section>
  );
}
