import type { Key } from "react-aria-components";
import { Tabs } from "@heroui/react";
import { cn } from "../lib/cn.ts";

export interface PillTab<K extends string> {
  id: K;
  label: React.ReactNode;
}

/**
 * The segmented pill tabs used across the design (bg-default track,
 * bg-segment thumb). HeroUI's primary Tabs already render this look;
 * this wrapper fixes the two sizes the design uses and keeps tab ids typed.
 */
export function PillTabs<K extends string>({
  items,
  selectedKey,
  onSelectionChange,
  size = "md",
  ariaLabel,
  className,
}: {
  items: PillTab<K>[];
  selectedKey: K;
  onSelectionChange: (key: K) => void;
  size?: "sm" | "md";
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Tabs
      selectedKey={selectedKey}
      onSelectionChange={(key: Key) => onSelectionChange(String(key) as K)}
      className={cn("w-fit", className)}
    >
      <Tabs.ListContainer className="w-fit">
        <Tabs.List aria-label={ariaLabel} className={cn("w-fit min-w-0", size === "md" ? "h-9" : "h-8")}>
          {items.map((item) => (
            <Tabs.Tab
              key={item.id}
              id={item.id}
              className={cn(
                "whitespace-nowrap rounded-3xl px-4 font-medium",
                size === "md" ? "h-7 text-sm" : "h-6 text-xs",
              )}
            >
              {item.label}
              <Tabs.Indicator className="rounded-3xl" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
