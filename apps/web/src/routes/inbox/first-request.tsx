import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { Antenna, ArrowRight, Code, Copy, type LucideIcon, Plug, SlidersHorizontal } from "lucide-react";
import { type SnippetLang, firstRequestSnippet } from "@inb/shared";
import { CodeView, CopyButton, useCopy } from "../../components/code.tsx";
import { PillTabs } from "../../components/pill-tabs.tsx";
import { ListToolbar } from "./request-list.tsx";

const SKELETON_WIDTHS = [170, 140, 196, 120, 160, 132];
const SKELETON_OPACITY = [0.9, 0.68, 0.5, 0.34, 0.2, 0.1];

const LANGS: { id: SnippetLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
];

/** List column while nothing has arrived: the stream is open, rows are ghosts. */
export function WaitingList({ order, onToggleOrder }: { order: "asc" | "desc"; onToggleOrder: () => void }) {
  return (
    <section
      aria-label="Requests"
      className="flex h-full w-[320px] shrink-0 flex-col border-r border-separator bg-background-secondary xl:w-[380px]"
    >
      <ListToolbar query="" onQueryChange={() => {}} order={order} onToggleOrder={onToggleOrder} disabled />
      <div className="h-px w-full shrink-0 bg-separator" />
      <div className="flex h-24 w-full shrink-0 flex-col justify-center gap-1.5 px-4" role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-accent animate-live" aria-hidden />
          <span className="text-[13px] font-medium text-foreground">Waiting for the first request</span>
        </div>
        <p className="text-[11.5px] leading-[17px] text-tertiary">
          The stream is open. Anything that arrives shows up here the moment it lands.
        </p>
      </div>
      <div aria-hidden className="flex flex-col">
        {SKELETON_WIDTHS.map((w, i) => (
          <div
            key={i}
            style={{ opacity: SKELETON_OPACITY[i] }}
            className="flex h-[68px] flex-col justify-center gap-[9px] border-b border-separator px-3.5"
          >
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-[38px] rounded bg-default" />
              <span className="h-[11px] rounded bg-default" style={{ width: w }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-[9px] w-24 rounded bg-default" />
              <span className="h-[9px] w-[54px] rounded bg-default" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const NEXT_STEP_CLASS =
  "group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-muted outline-none transition-colors hover:border-separator-tertiary hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus";

function NextStep({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{label}</span>
      <ArrowRight className="size-[13px] shrink-0 transition-transform group-hover:translate-x-0.5" />
    </>
  );
}

export function FirstRequestStage({ endpointId, url }: { endpointId: string; url: string }) {
  const [lang, setLang] = useState<SnippetLang>("curl");
  const { copy } = useCopy();
  const snippet = firstRequestSnippet(lang, url);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto px-10 py-8">
      <div className="flex w-full max-w-[620px] flex-col items-center gap-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Antenna className="size-[26px]" />
        </span>
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Your endpoint is live</h1>
          <p className="max-w-[480px] text-[13.5px] leading-[21px] text-tertiary">
            Point anything that speaks HTTP at this URL. The first request appears instantly — no refresh, no polling, no
            signup.
          </p>
        </div>

        <div className="flex h-12 w-full items-center gap-2.5 rounded-full border border-border bg-surface pl-[18px] pr-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" title={url}>
            {url}
          </span>
          <Button onPress={() => copy(url, "Endpoint URL copied")} className="h-9 shrink-0 rounded-3xl">
            <Copy className="size-4" />
            Copy URL
          </Button>
        </div>

        <section className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex h-[46px] w-full items-center gap-2 border-b border-separator px-2.5">
            <PillTabs items={LANGS} selectedKey={lang} onSelectionChange={setLang} size="sm" ariaLabel="Snippet language" />
            <span className="flex-1" />
            <CopyButton text={snippet} label="Copy snippet" />
          </div>
          <div className="bg-background px-2 py-0.5">
            <CodeView
              code={snippet}
              language={lang === "curl" ? "shell" : "text"}
              lineNumbers={false}
              className="text-[12.5px] leading-[22px]"
            />
          </div>
        </section>

        <nav aria-label="Next steps" className="flex w-full gap-3">
          <Link to="/e/$endpointId/response" params={{ endpointId }} className={NEXT_STEP_CLASS}>
            <NextStep icon={Code} label="Set a custom response" />
          </Link>
          <Link to="/rules" className={NEXT_STEP_CLASS}>
            <NextStep icon={SlidersHorizontal} label="Add a rule" />
          </Link>
          <Link to="/integrations" className={NEXT_STEP_CLASS}>
            <NextStep icon={Plug} label="Connect an integration" />
          </Link>
        </nav>
      </div>
    </div>
  );
}
