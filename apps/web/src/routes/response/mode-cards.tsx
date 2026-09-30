import { Radio, RadioGroup } from "react-aria-components";
import { ArrowRightLeft, CircleCheck, Code, FileText, type LucideIcon } from "lucide-react";
import type { ResponseMode } from "@inb/shared";
import { cn } from "../../lib/cn.ts";

const MODES: { mode: ResponseMode; title: string; description: string; icon: LucideIcon }[] = [
  {
    mode: "static",
    title: "Static",
    description: "Always return the same body and status.",
    icon: FileText,
  },
  {
    mode: "template",
    title: "Template",
    description: "Interpolate request data with {{ variables }}.",
    icon: Code,
  },
  {
    mode: "proxy",
    title: "Proxy",
    description: "Forward upstream and relay the real response.",
    icon: ArrowRightLeft,
  },
];

export function ModeCards({
  value,
  onChange,
}: {
  value: ResponseMode;
  onChange: (mode: ResponseMode) => void;
}) {
  return (
    <RadioGroup
      aria-label="Response mode"
      orientation="horizontal"
      value={value}
      onChange={(v) => onChange(v as ResponseMode)}
      className="flex w-full gap-3 max-[760px]:flex-col"
    >
      {MODES.map(({ mode, title, description, icon: Icon }) => (
        <Radio
          key={mode}
          value={mode}
          className={({ isSelected, isFocusVisible, isHovered }) =>
            cn(
              "flex flex-1 cursor-pointer flex-col gap-1.5 rounded-lg border p-3.5 outline-none transition-colors",
              isSelected ? "border-accent bg-accent-soft" : "border-border bg-surface",
              !isSelected && isHovered && "border-separator-tertiary",
              isFocusVisible && "ring-2 ring-focus ring-offset-2 ring-offset-background",
            )
          }
        >
          {({ isSelected }) => (
            <>
              <span className="flex w-full items-center gap-2">
                <Icon
                  className={cn("size-[15px] shrink-0", isSelected ? "text-accent" : "text-muted")}
                  aria-hidden
                />
                <span className="flex-1 text-[13.5px] font-semibold text-foreground">{title}</span>
                {isSelected && (
                  <CircleCheck className="size-[15px] shrink-0 text-accent" aria-hidden />
                )}
              </span>
              <span className="text-[11.5px] leading-[17px] text-tertiary">{description}</span>
            </>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}
