import { type Tone, methodTone, statusLabel, statusTone } from "@inb/shared";
import { cn } from "../lib/cn.ts";

const SOFT: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
  default: "bg-default text-foreground",
};

const TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
  default: "text-muted",
};

/** `POST` pill: 10px mono in lists, 11px in the inspector header. */
export function MethodBadge({
  method,
  size = "sm",
  className,
}: {
  method: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-mono font-semibold tracking-[0.4px]",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-[3px] text-[11px]",
        SOFT[methodTone(method)],
        className,
      )}
    >
      {method.toUpperCase()}
    </span>
  );
}

/** Bare status number (list rows). */
export function StatusCode({ status, className }: { status: number; className?: string }) {
  return (
    <span className={cn("font-mono text-xs font-semibold", TEXT[statusTone(status)], className)}>
      {status}
    </span>
  );
}

/**
 * `200 OK` soft pill. The code is mono (it is data), the reason phrase is not
 * (it is prose) — and the whole pill never wraps, or it blows out the headers
 * it sits in.
 */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: number;
  label?: string;
  className?: string;
}) {
  const reason = STATUS_REASON.exec(statusLabel(status))?.[1] ?? "";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium",
        SOFT[statusTone(status)],
        className,
      )}
    >
      {label ?? (
        <>
          <span className="font-mono font-semibold">{status}</span>
          {reason ? <span className="truncate">{reason}</span> : null}
        </>
      )}
    </span>
  );
}

/** `statusLabel` returns `"<code> <reason>"`; this peels the reason back off. */
const STATUS_REASON = /^\d+\s+(.*)$/;

/** Generic soft tone pill (`Custom`, `Transform`, `Slack #payments`…). */
export function TonePill({
  tone = "default",
  mono,
  className,
  children,
}: {
  tone?: Tone;
  mono?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-[11px] font-medium",
        mono && "font-mono",
        SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Green is reserved for 2xx, so "we are listening" is the signal, not success.
 */
export function LiveDot({
  tone = "signal",
  pulse = true,
}: {
  tone?: "signal" | "success" | "accent" | "warning" | "danger";
  pulse?: boolean;
}) {
  const bg = {
    signal: "bg-signal",
    success: "bg-success",
    accent: "bg-accent",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <span
      className={cn("size-[7px] shrink-0 rounded-full", bg, pulse && "animate-live")}
      aria-hidden
    />
  );
}
