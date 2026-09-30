import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Label, ListBox, Select, Switch, TextField } from "@heroui/react";
import { Archive, Ban, ChevronRight, type LucideIcon, Reply, RotateCcw, Send, Trash } from "lucide-react";
import type { Integration, RuleAction } from "@inb/shared";
import { CodeEditor } from "../../components/code-editor.tsx";
import { cn } from "../../lib/cn.ts";
import { compactField } from "./condition-row.tsx";
import { describeAction } from "./rule-utils.ts";

const ICON: Record<RuleAction["type"], LucideIcon> = {
  forward: Send,
  respond: Reply,
  replay: RotateCcw,
  archive: Archive,
  drop: Ban,
};

const ICON_TONE: Record<RuleAction["type"], string> = {
  forward: "text-success",
  respond: "text-warning",
  replay: "text-accent",
  archive: "text-muted",
  drop: "text-danger",
};

export function ActionRow({
  action,
  index,
  integrations,
  onChange,
  onRemove,
  defaultOpen = false,
}: {
  action: RuleAction;
  index: number;
  integrations: Integration[];
  onChange: (next: RuleAction) => void;
  onRemove: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = ICON[action.type];
  const { title, subtitle } = describeAction(action, integrations);
  const panelId = `rule-action-${index}`;

  return (
    <div className="flex w-full flex-col rounded-xl bg-background-secondary">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Icon className={cn("size-[15px] shrink-0", ICON_TONE[action.type])} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12.5px] font-medium text-foreground">{title}</span>
          <span className="truncate text-[11px] text-tertiary">{subtitle}</span>
        </span>
        <ChevronRight className={cn("size-3.5 shrink-0 text-tertiary transition-transform", open && "rotate-90")} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-separator px-3 pb-3 pt-3">
          <ActionFields action={action} integrations={integrations} onChange={onChange} />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onPress={onRemove} className="h-7 text-danger">
              <Trash className="size-3.5" />
              Remove action
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionFields({
  action,
  integrations,
  onChange,
}: {
  action: RuleAction;
  integrations: Integration[];
  onChange: (next: RuleAction) => void;
}) {
  switch (action.type) {
    case "forward":
      return integrations.length ? (
        <Select
          value={action.integrationId || null}
          onChange={(key) => key && onChange({ ...action, integrationId: String(key) })}
          placeholder="Choose an integration"
        >
          <Label className="text-xs text-muted">Integration</Label>
          <Select.Trigger className={cn(compactField, "flex w-full items-center justify-between font-sans")}>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {integrations.map((i) => (
                <ListBox.Item key={i.id} id={i.id} textValue={i.name}>
                  <span className="flex flex-col">
                    <span className="text-sm">{i.name}</span>
                    <span className="text-xs text-tertiary">{i.target || i.kind}</span>
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : (
        <p className="text-xs text-muted">
          No integrations yet.{" "}
          <Link to="/integrations" className="text-accent hover:underline">
            Connect one
          </Link>{" "}
          to forward requests.
        </p>
      );
    case "respond":
      return (
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2">
            <TextField
              className="w-24"
              value={String(action.status)}
              onChange={(v) => {
                const n = Number(v.replace(/\D/g, "").slice(0, 3));
                onChange({ ...action, status: Number.isFinite(n) ? n : 200 });
              }}
              inputMode="numeric"
            >
              <Label className="text-xs text-muted">Status</Label>
              <Input className={compactField} />
            </TextField>
            <TextField className="flex-1" value={action.contentType} onChange={(v) => onChange({ ...action, contentType: v })}>
              <Label className="text-xs text-muted">Content-Type</Label>
              <Input className={compactField} />
            </TextField>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Body · supports {"{{ request.* }}"}</span>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <CodeEditor
                ariaLabel="Response body"
                value={action.body}
                onChange={(body) => onChange({ ...action, body })}
                language={action.contentType.includes("json") ? "json" : "text"}
                minHeight="64px"
                maxHeight="180px"
                lineNumbers={false}
                placeholder='{ "error": "unauthorized" }'
              />
            </div>
          </div>
          {(action.status < 100 || action.status > 599) && (
            <p className="text-xs text-danger">Status must be between 100 and 599.</p>
          )}
        </div>
      );
    case "replay":
      return (
        <div className="flex flex-col gap-2.5">
          <TextField value={action.url} onChange={(url) => onChange({ ...action, url })} type="url">
            <Label className="text-xs text-muted">Destination URL</Label>
            <Input className={compactField} placeholder="http://localhost:4000/webhooks" />
          </TextField>
          <Switch
            isSelected={action.onlyWhileTunnel}
            onChange={(onlyWhileTunnel) => onChange({ ...action, onlyWhileTunnel })}
            size="sm"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <span className="text-xs text-muted">Only while the dev tunnel is open</span>
            </Switch.Content>
          </Switch>
          <p className="text-[11px] leading-relaxed text-tertiary">
            Localhost and private addresses are delivered through <code className="font-mono">inbound tail</code>; public
            URLs are replayed from the edge with retries.
          </p>
        </div>
      );
    case "archive":
      return <p className="text-xs text-muted">Matching requests are copied to the Archive and kept past the endpoint’s retention.</p>;
    case "drop":
      return (
        <p className="text-xs text-muted">
          Matching requests are answered but not stored, and no further actions or integrations run.
        </p>
      );
  }
}
