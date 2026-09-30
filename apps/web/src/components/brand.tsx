import type { SVGProps } from "react";
import { cn } from "../lib/cn.ts";

const SLASHES = "M15.3 3.6 11.4 19.4M21.8 3.6 17.9 19.4";
const BOX = "M4.5 14.5v8.5a4.5 4.5 0 0 0 4.5 4.5h14a4.5 4.5 0 0 0 4.5-4.5v-8.5";

/**
 * The inb.sh mark: the `//` of `http://` dropping into an inbox. The box
 * takes `currentColor`, the slashes the signal (pass `mono` to draw both in
 * currentColor). 32px grid; masters live in docs/brand/.
 */
export function InbGlyph({ mono, ...props }: SVGProps<SVGSVGElement> & { mono?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      strokeWidth="2.9"
      strokeLinecap="round"
      aria-hidden
      {...props}
    >
      <path d={BOX} stroke="currentColor" />
      <path d={SLASHES} stroke={mono ? "currentColor" : "var(--signal)"} />
    </svg>
  );
}

/** Logo mark as used in the sidebar and on the login page — no tile. */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <InbGlyph
      className={cn("shrink-0 text-foreground", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** `inb.sh` — `.sh` in the signal, matching the `//` of the mark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-[-0.01em] text-foreground", className)}>
      inb<span className="text-signal">.sh</span>
    </span>
  );
}
