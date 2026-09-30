import { Fragment } from "react";
import { Skeleton } from "@heroui/react";
import { Download, type LucideIcon, Reply, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { usePipeline } from "../../lib/queries.ts";
import { cn } from "../../lib/cn.ts";

interface Stage {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  highlight: boolean;
}

const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/** Receive → Match → Transform → Respond → Deliver, as in the design's header card. */
export function PipelineStrip() {
  const { data } = usePipeline();

  const stages: Stage[] = data
    ? [
        {
          icon: Download,
          title: "Receive",
          subtitle: `${data.receivedToday.toLocaleString("en-US")} today`,
          highlight: false,
        },
        {
          icon: SlidersHorizontal,
          title: "Match",
          subtitle: plural(data.rules, "rule"),
          highlight: true,
        },
        {
          icon: Sparkles,
          title: "Transform",
          subtitle: `${data.activeTransforms} active`,
          highlight: true,
        },
        {
          icon: Reply,
          title: "Respond",
          subtitle: `${data.customResponses > 0 ? "custom" : "default"}${data.avgResponseMs !== null ? ` · ${data.avgResponseMs} ms` : ""}`,
          highlight: false,
        },
        {
          icon: Send,
          title: "Deliver",
          subtitle: plural(data.integrations, "integration"),
          highlight: false,
        },
      ]
    : [];

  return (
    <section
      aria-label="Request pipeline"
      className="flex h-[88px] w-full shrink-0 items-center gap-3.5 rounded-2xl border border-border bg-surface px-[22px]"
    >
      {!data &&
        Array.from({ length: 5 }, (_, i) => (
          <Fragment key={i}>
            {i > 0 && <div className="h-px flex-1 bg-separator-tertiary" />}
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-2.5 w-12 rounded" />
              </div>
            </div>
          </Fragment>
        ))}
      {stages.map((stage, i) => (
        <Fragment key={stage.title}>
          {i > 0 && (
            <div className="flex h-5 min-w-4 flex-1 items-center" aria-hidden>
              <div className="h-px flex-1 bg-separator-tertiary" />
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full",
                stage.highlight
                  ? "bg-accent-soft text-accent"
                  : "bg-background-secondary text-muted",
              )}
            >
              <stage.icon className="size-[15px]" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">{stage.title}</span>
              <span className="whitespace-nowrap text-[11px] text-tertiary">{stage.subtitle}</span>
            </span>
          </div>
        </Fragment>
      ))}
    </section>
  );
}
