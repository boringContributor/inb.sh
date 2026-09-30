import { useState } from "react";
import {
  Button as AriaButton,
  DropIndicator,
  GridList,
  GridListItem,
  type Key,
  useDragAndDrop,
} from "react-aria-components";
import { AlertDialog, Button, Dropdown, Label, Skeleton, Switch } from "@heroui/react";
import { Copy, CornerDownRight, Ellipsis, GripVertical, Plus, Trash } from "lucide-react";
import { type Integration, type Rule, describeConditions } from "@inb/shared";
import { TonePill } from "../../components/badges.tsx";
import { cn } from "../../lib/cn.ts";
import { ruleChips, ruleStat } from "./rule-utils.ts";

export function RuleListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy>
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex h-[92px] items-center gap-3 rounded-lg border border-border bg-surface px-3.5"
        >
          <Skeleton className="size-[26px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-40 rounded" />
            <Skeleton className="h-3 w-64 rounded" />
            <Skeleton className="h-4 w-28 rounded-full" />
          </div>
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function RuleList({
  rules,
  integrations,
  selectedId,
  onSelect,
  onReorder,
  onToggle,
  onDuplicate,
  onDelete,
  onAdd,
  reorderable,
}: {
  rules: Rule[];
  integrations: Integration[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggle: (rule: Rule, enabled: boolean) => void;
  onDuplicate: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onAdd: () => void;
  /** off while a search filter is active — positions are global */
  reorderable: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState<Rule | null>(null);

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(e) {
      const moving = new Set<Key>(e.keys);
      const ids = rules.map((r) => r.id).filter((id) => !moving.has(id));
      const targetIndex = ids.indexOf(String(e.target.key));
      if (targetIndex < 0) return;
      const insertAt = e.target.dropPosition === "after" ? targetIndex + 1 : targetIndex;
      const moved = rules.map((r) => r.id).filter((id) => moving.has(id));
      ids.splice(insertAt, 0, ...moved);
      onReorder(ids);
    },
    renderDropIndicator: (target) => (
      <DropIndicator
        target={target}
        className={({ isDropTarget }) =>
          cn("h-0.5 rounded-full", isDropTarget ? "bg-accent" : "bg-transparent")
        }
      />
    ),
  });

  return (
    <>
      <GridList
        aria-label="Rules, in evaluation order"
        items={rules}
        dragAndDropHooks={reorderable ? dragAndDropHooks : undefined}
        onAction={(key) => onSelect(String(key))}
        className="flex flex-col gap-2.5 outline-none"
      >
        {(rule) => {
          const position = rules.findIndex((r) => r.id === rule.id) + 1;
          const chips = ruleChips(rule, integrations);
          const selected = rule.id === selectedId;
          return (
            <GridListItem
              id={rule.id}
              textValue={rule.name}
              className={({ isDragging, isFocusVisible }) =>
                cn(
                  "flex h-[92px] w-full shrink-0 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3.5 outline-none transition-colors",
                  selected ? "border-accent" : "border-border hover:border-separator-tertiary",
                  isFocusVisible && "ring-2 ring-focus",
                  isDragging && "opacity-50",
                )
              }
            >
              <AriaButton
                slot="drag"
                aria-label={`Reorder ${rule.name}`}
                isDisabled={!reorderable}
                className="flex h-8 w-4 cursor-grab items-center justify-center rounded text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
              >
                <GripVertical className="size-3.5" />
              </AriaButton>
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-background-secondary font-mono text-[11px] text-muted">
                {position}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className={cn(
                    "truncate text-[13.5px] font-semibold",
                    rule.enabled ? "text-foreground" : "text-tertiary",
                  )}
                >
                  {rule.name}
                </span>
                <span className="truncate font-mono text-[11px] text-tertiary">
                  {describeConditions(rule.conditions)}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <CornerDownRight className="size-[13px] shrink-0 text-tertiary" aria-hidden />
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {chips.length === 0 && (
                      <span className="text-[11px] text-tertiary">no actions</span>
                    )}
                    {chips.map((chip, i) => (
                      <TonePill
                        key={`${chip.label}-${i}`}
                        tone={chip.tone}
                        className={cn(
                          "rounded-sm",
                          chip.tone === "default" && "text-muted",
                          !rule.enabled && "opacity-70",
                        )}
                      >
                        {chip.label}
                      </TonePill>
                    ))}
                  </div>
                  <span className="min-w-2 flex-1" />
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-tertiary">
                    {ruleStat(rule)}
                  </span>
                </div>
              </div>
              <Switch
                aria-label={rule.enabled ? `Pause ${rule.name}` : `Enable ${rule.name}`}
                isSelected={rule.enabled}
                onChange={(enabled) => onToggle(rule, enabled)}
                size="md"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
              <Dropdown>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={`More actions for ${rule.name}`}
                  className="size-7 min-w-7 text-muted"
                >
                  <Ellipsis className="size-[15px]" />
                </Button>
                <Dropdown.Popover placement="bottom end" className="min-w-44">
                  <Dropdown.Menu
                    onAction={(key) => {
                      if (key === "duplicate") onDuplicate(rule);
                      if (key === "delete") setConfirmDelete(rule);
                    }}
                  >
                    <Dropdown.Item id="duplicate" textValue="Duplicate">
                      <Copy className="size-4 text-muted" />
                      <Label>Duplicate</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                      <Trash className="size-4" />
                      <Label>Delete</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </GridListItem>
          );
        }}
      </GridList>

      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-[64px] w-full flex-1 items-center justify-center gap-2 rounded-lg border border-separator-tertiary text-tertiary outline-none transition-colors hover:border-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Plus className="size-3.5" />
        <span className="text-[12.5px] font-medium">Add a rule</span>
      </button>

      <DeleteRuleDialog
        rule={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={(rule) => {
          onDelete(rule);
          setConfirmDelete(null);
        }}
      />
    </>
  );
}

export function DeleteRuleDialog({
  rule,
  onClose,
  onConfirm,
}: {
  rule: Rule | null;
  onClose: () => void;
  onConfirm: (rule: Rule) => void;
}) {
  return (
    <AlertDialog.Backdrop isOpen={!!rule} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger">
              <Trash className="size-5" />
            </AlertDialog.Icon>
            <AlertDialog.Heading>Delete “{rule?.name}”?</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-sm text-muted">
              Requests will stop matching this rule immediately. Its run history is deleted with it.
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="secondary">
              Cancel
            </Button>
            <Button variant="danger" onPress={() => rule && onConfirm(rule)}>
              Delete rule
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
