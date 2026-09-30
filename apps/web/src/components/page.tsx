import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/** 64px top bar shared by every screen (bottom separator, 20px gutters). */
export function Topbar({ left, right, className }: { left: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <header
      className={cn("flex h-16 w-full shrink-0 items-center justify-between gap-4 border-b border-separator px-5", className)}
    >
      <div className="flex min-w-0 items-center gap-3">{left}</div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="truncate text-[15px] font-semibold text-foreground">{children}</h1>;
}

/** Scrollable page body under the top bar. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>;
}

/** Card surface used across screens: #18181B, 1px #28282C, 16px radius. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("overflow-hidden rounded-2xl border border-border bg-surface", className)}>{children}</section>;
}

export function PanelHeader({ icon, title, children, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-11 w-full items-center gap-2 pl-3.5 pr-2.5", className)}>
      {icon && <span className="text-muted [&>svg]:size-3.5">{icon}</span>}
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      {children}
    </div>
  );
}
