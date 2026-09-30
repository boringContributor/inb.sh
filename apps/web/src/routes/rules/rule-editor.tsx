import { useEffect, useState } from "react";
import { Button, Dropdown, Label, ListBox, Select } from "@heroui/react";
import {
  Archive,
  Ban,
  Copy,
  CornerDownRight,
  Ellipsis,
  GitBranch,
  Play,
  Plus,
  Reply,
  RotateCcw,
  Send,
  Sparkles,
  Trash,
} from "lucide-react";
import type { DryRunResult, Endpoint, Integration, Rule, RuleAction } from "@inb/shared";
import { TonePill } from "../../components/badges.tsx";
import { CodeEditor } from "../../components/code-editor.tsx";
import { ApiError, api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { useSaveRule } from "../../lib/queries.ts";
import { ActionRow } from "./action-row.tsx";
import { ConditionFieldSuggestions, ConditionRow, compactField } from "./condition-row.tsx";
import { DryRunPanel } from "./dry-run-panel.tsx";
import { DEFAULT_TRANSFORM, type Draft, newAction, normaliseDraft, sameDraft, timeAgo } from "./rule-utils.ts";
import { TransformModal } from "./transform-modal.tsx";

function SectionHead({
  icon: Icon,
  title,
  action,
  onAction,
  actionSlot,
}: {
  icon: typeof GitBranch;
  title: string;
  action?: string;
  onAction?: () => void;
  actionSlot?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-[7px]">
      <Icon className="size-[13px] text-muted" aria-hidden />
      <h3 className="text-xs font-semibold tracking-[0.3px] text-foreground">{title}</h3>
      <span className="flex-1" />
      {actionSlot}
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="rounded text-[11px] font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
        >
          {action}
        </button>
      )}
    </div>
  );
}

const ADD_ACTIONS: { type: RuleAction["type"]; label: string; icon: typeof Send }[] = [
  { type: "forward", label: "Forward to integration", icon: Send },
  { type: "respond", label: "Respond with…", icon: Reply },
  { type: "replay", label: "Replay to URL", icon: RotateCcw },
  { type: "archive", label: "Archive", icon: Archive },
  { type: "drop", label: "Drop", icon: Ban },
];

export function RuleEditor({
  rule,
  initial,
  integrations,
  endpoints,
  testSignal,
  onSaved,
  onDiscardNew,
  onDuplicate,
  onDelete,
}: {
  /** null while editing an unsaved draft */
  rule: Rule | null;
  initial: Draft;
  integrations: Integration[];
  endpoints: Endpoint[];
  /** bump to trigger a dry run from outside (topbar "Test with last request") */
  testSignal: number;
  onSaved: (rule: Rule) => void;
  onDiscardNew: () => void;
  onDuplicate: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [transformOpen, setTransformOpen] = useState(false);
  const [transformError, setTransformError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<{ result: DryRunResult | null; pending: boolean; error: string | null } | null>(
    null,
  );
  const [newActionIndex, setNewActionIndex] = useState<number | null>(null);
  const save = useSaveRule();

  const dirty = !rule || !sameDraft(draft, baseline);
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveError(null);
  };

  const runDryRun = async () => {
    setDryRun({ result: null, pending: true, error: null });
    try {
      const result = await api.dryRun({ rule: normaliseDraft(draft), endpointId: draft.endpointId ?? undefined });
      setDryRun({ result, pending: false, error: null });
    } catch (err) {
      setDryRun({ result: null, pending: false, error: err instanceof ApiError ? err.message : "Dry run failed" });
    }
  };

  useEffect(() => {
    if (testSignal > 0) void runDryRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testSignal]);

  const apply = async () => {
    setTransformError(null);
    setSaveError(null);
    const input = normaliseDraft(draft);
    const invalidAction = input.actions.find(
      (a) =>
        (a.type === "forward" && !a.integrationId) ||
        (a.type === "respond" && (a.status < 100 || a.status > 599)) ||
        (a.type === "replay" && !/^https?:\/\//.test(a.url)),
    );
    if (invalidAction) {
      setSaveError("Finish configuring every action before applying.");
      return;
    }
    if (input.conditions.some((c) => !c.field.trim())) {
      setSaveError("Every condition needs a field.");
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: rule?.id, input });
      setBaseline(input);
      setDraft(input);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_transform") setTransformError(err.message);
      else setSaveError(err instanceof ApiError ? err.message : "Couldn't save the rule");
    }
  };

  const conditionResults = dryRun?.result?.requestId ? dryRun.result.conditions : undefined;

  return (
    <section
      aria-label="Rule editor"
      className="flex h-full w-[440px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <ConditionFieldSuggestions />
      <header className="flex flex-col gap-1.5 border-b border-separator px-4 py-3.5">
        <div className="flex w-full items-center gap-2">
          <input
            aria-label="Rule name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            className="min-w-0 flex-1 rounded-md bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-tertiary focus-visible:ring-2 focus-visible:ring-focus"
            placeholder="Rule name"
          />
          <button
            type="button"
            onClick={() => update({ enabled: !draft.enabled })}
            aria-pressed={draft.enabled}
            aria-label={draft.enabled ? "Enabled — click to pause" : "Paused — click to enable"}
            className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <TonePill tone={draft.enabled ? "success" : "default"} className="rounded-2xl px-2 text-xs">
              {draft.enabled ? "Enabled" : "Paused"}
            </TonePill>
          </button>
          <Dropdown>
            <Button isIconOnly variant="ghost" size="sm" aria-label="Rule actions" className="size-7 min-w-7 text-muted">
              <Ellipsis className="size-[15px]" />
            </Button>
            <Dropdown.Popover placement="bottom end" className="min-w-48">
              <Dropdown.Menu
                disabledKeys={rule ? [] : ["duplicate"]}
                onAction={(key) => {
                  if (key === "duplicate" && rule) onDuplicate(rule);
                  if (key === "revert") setDraft(baseline);
                  if (key === "delete") {
                    if (rule) onDelete(rule);
                    else onDiscardNew();
                  }
                }}
              >
                <Dropdown.Item id="duplicate" textValue="Duplicate">
                  <Copy className="size-4 text-muted" />
                  <Label>Duplicate</Label>
                </Dropdown.Item>
                <Dropdown.Item id="revert" textValue="Discard changes">
                  <RotateCcw className="size-4 text-muted" />
                  <Label>Discard changes</Label>
                </Dropdown.Item>
                <Dropdown.Item id="delete" textValue={rule ? "Delete" : "Discard draft"} variant="danger">
                  <Trash className="size-4" />
                  <Label>{rule ? "Delete rule" : "Discard draft"}</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
        <p className="text-[11.5px] leading-[17px] text-tertiary">
          Runs on every incoming request, in order.{" "}
          {rule ? `Last edited ${timeAgo(rule.updatedAt)} by you.` : "Not saved yet."}
        </p>
        <Select
          aria-label="Endpoints this rule applies to"
          value={draft.endpointId ?? "all"}
          onChange={(key) => update({ endpointId: key === "all" || !key ? null : String(key) })}
          className="mt-1 w-full"
        >
          <Select.Trigger className={cn(compactField, "flex w-full items-center justify-between font-sans text-muted")}>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="all" textValue="All endpoints">
                All endpoints
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {endpoints.map((e) => (
                <ListBox.Item key={e.id} id={e.id} textValue={e.name}>
                  Only {e.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4">
        {/* WHEN */}
        <div className="flex flex-col gap-2">
          <SectionHead
            icon={GitBranch}
            title="WHEN"
            action="Add condition"
            onAction={() => update({ conditions: [...draft.conditions, { field: "", op: "is", value: "" }] })}
          />
          {draft.conditions.length === 0 && (
            <p className="text-[11.5px] text-tertiary">No conditions — the rule matches every request.</p>
          )}
          {draft.conditions.map((condition, i) => (
            <div key={i} className="flex flex-col gap-2">
              {i > 0 && (
                <span className="w-fit rounded bg-background-secondary px-1.5 py-px font-mono text-[10px] font-semibold text-tertiary">
                  AND
                </span>
              )}
              <ConditionRow
                condition={condition}
                index={i}
                result={conditionResults?.[i]}
                onChange={(next) => update({ conditions: draft.conditions.map((c, j) => (j === i ? next : c)) })}
                onRemove={() => update({ conditions: draft.conditions.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>

        {/* TRANSFORM */}
        <div className="flex flex-col gap-2">
          <SectionHead
            icon={Sparkles}
            title="TRANSFORM"
            action={draft.transform !== null ? "Open editor" : undefined}
            onAction={() => setTransformOpen(true)}
            actionSlot={
              draft.transform !== null ? (
                <button
                  type="button"
                  onClick={() => update({ transform: null })}
                  className="mr-2 rounded text-[11px] font-medium text-tertiary outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Remove
                </button>
              ) : null
            }
          />
          {draft.transform !== null ? (
            <div
              className={cn(
                "overflow-hidden rounded-xl border bg-background",
                transformError ? "border-danger" : "border-border",
              )}
            >
              <CodeEditor
                ariaLabel="Transform expression"
                language="jsonata"
                value={draft.transform}
                onChange={(transform) => {
                  update({ transform });
                  setTransformError(null);
                }}
                lineNumbers={false}
                minHeight="96px"
                maxHeight="220px"
                className="px-1"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => update({ transform: DEFAULT_TRANSFORM })}
              className="flex items-center gap-2 rounded-xl border border-dashed border-separator-tertiary px-3 py-2.5 text-left text-[11.5px] text-tertiary outline-none transition-colors hover:border-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Plus className="size-3.5" />
              Add transform — reshape headers and body with JSONata before delivery
            </button>
          )}
          {transformError && <p className="font-mono text-[11px] text-danger">{transformError}</p>}
        </div>

        {/* THEN */}
        <div className="flex flex-col gap-2">
          <SectionHead
            icon={CornerDownRight}
            title="THEN"
            actionSlot={
              <Dropdown>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 min-w-0 px-0 py-0 text-[11px] font-medium text-accent hover:bg-transparent hover:underline"
                >
                  Add action
                </Button>
                <Dropdown.Popover placement="bottom end" className="min-w-52">
                  <Dropdown.Menu
                    onAction={(key) => {
                      const type = key as RuleAction["type"];
                      setNewActionIndex(draft.actions.length);
                      update({ actions: [...draft.actions, newAction(type, integrations)] });
                    }}
                  >
                    {ADD_ACTIONS.map((a) => (
                      <Dropdown.Item key={a.type} id={a.type} textValue={a.label}>
                        <a.icon className="size-4 text-muted" />
                        <Label>{a.label}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            }
          />
          {draft.actions.length === 0 && (
            <p className="text-[11.5px] text-tertiary">No actions — matching requests are only counted.</p>
          )}
          {draft.actions.map((action, i) => (
            <ActionRow
              key={`${i}-${action.type}`}
              action={action}
              index={i}
              integrations={integrations}
              defaultOpen={i === newActionIndex}
              onChange={(next) => update({ actions: draft.actions.map((a, j) => (j === i ? next : a)) })}
              onRemove={() => update({ actions: draft.actions.filter((_, j) => j !== i) })}
            />
          ))}
        </div>

        {dryRun && (
          <DryRunPanel
            result={dryRun.result}
            pending={dryRun.pending}
            error={dryRun.error}
            onClose={() => setDryRun(null)}
          />
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-separator px-4 py-3">
        <span
          className={cn("min-w-0 flex-1 truncate text-[11px]", saveError ? "text-danger" : dirty ? "text-warning" : "text-tertiary")}
          aria-live="polite"
        >
          {saveError ?? (save.isPending ? "Saving…" : dirty ? (rule ? "Unsaved changes" : "Draft — not saved") : "All changes saved")}
        </span>
        <Button variant="outline" size="sm" className="h-8" onPress={runDryRun} isPending={dryRun?.pending}>
          <Play className="size-3.5" />
          Dry run
        </Button>
        <Button size="sm" className="h-8" onPress={apply} isDisabled={!dirty} isPending={save.isPending}>
          Apply
        </Button>
      </footer>

      <TransformModal
        isOpen={transformOpen}
        onOpenChange={setTransformOpen}
        draft={draft}
        onApply={(transform) => {
          update({ transform });
          setTransformError(null);
        }}
      />
    </section>
  );
}
