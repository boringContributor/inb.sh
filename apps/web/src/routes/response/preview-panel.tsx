import { Link, Skeleton, Tooltip } from "@heroui/react";
import { ArrowRightLeft, Braces, Eye } from "lucide-react";
import { TEMPLATE_VARIABLES, statusTone } from "@inb/shared";
import { CodeView, CopyButton, useCopy } from "../../components/code.tsx";
import { cn } from "../../lib/cn.ts";
import { type PreviewResponse, type ProxyPreview, previewToText } from "./preview.ts";

const STATUS_COLOR = {
  success: "text-code-string",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
  default: "text-muted",
} as const;

export function PreviewPanel({
  preview,
  source,
  loading,
  disabled,
}: {
  preview: PreviewResponse | ProxyPreview;
  /** e.g. `req_8f2a91c4e7` or null for the built-in sample */
  source: string | null;
  loading: boolean;
  disabled: boolean;
}) {
  const text = preview.kind === "http" ? previewToText(preview) : "";
  // exact bytes as sent; JSON just gets the design's palette
  const body = preview.kind === "http" ? preview.body : "";

  return (
    <section
      aria-label="Live preview"
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <header className="flex h-[46px] w-full items-center gap-2 border-b border-separator pl-4 pr-2.5">
        <Eye className="size-[15px] text-muted" aria-hidden />
        <h2 className="flex-1 text-[13px] font-semibold text-foreground">Live preview</h2>
        {preview.kind === "http" && <CopyButton text={text} label="Copy response" />}
      </header>
      <div
        className="flex max-h-[360px] flex-col overflow-auto bg-background px-3.5 py-3 font-mono text-xs leading-[19px]"
        aria-live="polite"
      >
        {loading ? (
          <div className="flex flex-col gap-2 py-1">
            {[60, 80, 70, 75, 50].map((w, i) => (
              <Skeleton key={i} className="h-3 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : preview.kind === "proxy" ? (
          <div className="flex flex-col gap-2 py-1 font-sans text-[12.5px] leading-5 text-muted">
            <span className="flex items-center gap-2 font-mono text-xs text-foreground">
              <ArrowRightLeft className="size-3.5 text-accent" aria-hidden />
              {preview.url || "no upstream URL yet"}
            </span>
            <p>
              Requests are forwarded {preview.delayMs > 0 ? `after ${preview.delayMs} ms ` : ""}and
              the upstream's real response is relayed, so there's nothing to render ahead of time.
            </p>
          </div>
        ) : (
          <>
            <div className="whitespace-pre">
              <span className="text-muted">HTTP/1.1</span>{" "}
              <span className={STATUS_COLOR[statusTone(preview.status)]}>
                {preview.status} {preview.statusText}
              </span>
            </div>
            {preview.headers.map(([k, v], i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                <span className="text-code-key">{k}:</span> <span className="text-muted">{v}</span>
              </div>
            ))}
            <div className="h-[19px]" aria-hidden />
            {body ? (
              <CodeView
                code={body}
                language={preview.isJson && !preview.invalidJson ? "json" : "text"}
                lineNumbers={false}
                wrap
                className="-mx-3.5 overflow-visible py-0 leading-[19px] [&_td]:pl-3.5"
              />
            ) : (
              <span className="font-sans text-tertiary">(empty body)</span>
            )}
          </>
        )}
      </div>
      <footer className="flex items-center gap-1.5 border-t border-separator px-4 py-2 text-[11px] text-tertiary">
        {disabled ? (
          <span>Custom response is off — this is the default reply.</span>
        ) : source ? (
          <span>
            Rendered with <span className="font-mono text-muted">{source}</span>, the latest request
          </span>
        ) : (
          <span>Rendered with a sample request — send one to preview with real data</span>
        )}
      </footer>
    </section>
  );
}

export function VariablesPanel({
  docsHref,
  template,
}: {
  docsHref: string | null;
  template: boolean;
}) {
  const { copy } = useCopy();
  return (
    <section
      aria-label="Template variables"
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <header className="flex h-[46px] w-full shrink-0 items-center gap-2 border-b border-separator px-4">
        <Braces className="size-[15px] text-muted" aria-hidden />
        <h2 className="flex-1 text-[13px] font-semibold text-foreground">Template variables</h2>
        {docsHref && (
          <Link
            href={docsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent no-underline hover:underline"
          >
            Docs
          </Link>
        )}
      </header>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2.5">
        {TEMPLATE_VARIABLES.map((v) => (
          <li key={v.token}>
            <Tooltip delay={500}>
              <button
                type="button"
                onClick={() => void copy(v.token, `Copied ${v.token}`)}
                className="flex w-full flex-col gap-0.5 rounded-xl px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-default/50 focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="whitespace-nowrap font-mono text-xs text-code-keyword">
                  {v.token}
                </span>
                <span className="text-[11.5px] text-tertiary">{v.description}</span>
              </button>
              <Tooltip.Content>Click to copy</Tooltip.Content>
            </Tooltip>
          </li>
        ))}
      </ul>
      {!template && (
        <p
          className={cn(
            "mt-auto border-t border-separator px-4 py-2.5 text-[11px] leading-4 text-tertiary",
          )}
        >
          Variables are only interpolated in <span className="text-muted">Template</span> mode.
        </p>
      )}
    </section>
  );
}
