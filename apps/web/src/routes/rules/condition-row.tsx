import { Button, Input, ListBox, Select } from "@heroui/react";
import { X } from "lucide-react";
import { CONDITION_FIELDS, CONDITION_OPS, type Condition, type ConditionOp } from "@inb/shared";
import { cn } from "../../lib/cn.ts";

const FIELD_LIST_ID = "inb-rule-condition-fields";

/** Shared class for the design's compact 30px mono inputs. */
export const compactField =
  "h-[30px] min-h-[30px] rounded-lg border border-border bg-surface px-2.5 font-mono text-[11.5px] shadow-none";

export function ConditionFieldSuggestions() {
  return (
    <datalist id={FIELD_LIST_ID}>
      {CONDITION_FIELDS.map((f) => (
        <option key={f} value={f} />
      ))}
      <option value="body.livemode" />
      <option value="body.data.object.id" />
      <option value="signature.verified" />
      <option value="query.token" />
    </datalist>
  );
}

export function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  result,
}: {
  condition: Condition;
  index: number;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  /** dry-run outcome for this row, if one ran */
  result?: { passed: boolean; actual: unknown };
}) {
  const needsValue = CONDITION_OPS.find((o) => o.op === condition.op)?.needsValue ?? true;
  return (
    <div className="flex w-full items-center gap-1.5">
      <Input
        aria-label={`Condition ${index + 1} field`}
        list={FIELD_LIST_ID}
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        placeholder="body.type"
        spellCheck={false}
        className={cn(compactField, "w-40 shrink-0 text-code-key")}
      />
      <Select
        aria-label={`Condition ${index + 1} operator`}
        value={condition.op}
        onChange={(key) => key && onChange({ ...condition, op: key as ConditionOp })}
        className="w-[120px] shrink-0"
      >
        <Select.Trigger
          className={cn(compactField, "flex w-full items-center justify-between text-muted")}
        >
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {CONDITION_OPS.map((o) => (
              <ListBox.Item key={o.op} id={o.op} textValue={o.label}>
                <span className="font-mono text-xs">{o.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {needsValue ? (
        <Input
          aria-label={`Condition ${index + 1} value`}
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder='"invoice."'
          spellCheck={false}
          className={cn(compactField, "min-w-0 flex-1 text-code-string")}
        />
      ) : (
        <span className="flex-1" />
      )}
      {result && (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            result.passed ? "bg-success" : "bg-danger",
          )}
          title={
            result.passed
              ? "matched on the last request"
              : `no match — actual: ${JSON.stringify(result.actual) ?? "undefined"}`
          }
          aria-label={result.passed ? "Condition passed" : "Condition failed"}
        />
      )}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={`Remove condition ${index + 1}`}
        onPress={onRemove}
        className="size-[26px] min-w-[26px] text-tertiary"
      >
        <X className="size-[13px]" />
      </Button>
    </div>
  );
}
