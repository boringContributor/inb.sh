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

/** `200 OK` soft pill. */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-2xl px-2 py-0.5 text-xs font-medium",
        SOFT[statusTone(status)],
        className,
      )}
    >
      {label ?? statusLabel(status)}
    </span>
  );
}

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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-2xl px-2 py-0.5 text-[11px] font-medium",
        mono && "font-mono",
        SOFT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({
  tone = "success",
  pulse = true,
}: {
  tone?: "success" | "accent" | "warning" | "danger";
  pulse?: boolean;
}) {
  const bg = {
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
