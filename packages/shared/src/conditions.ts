import type { Condition, ConditionOp } from "./types.ts";
import { type RequestContext, resolvePath } from "./context.ts";

export const CONDITION_OPS: { op: ConditionOp; label: string; needsValue: boolean }[] = [
  { op: "is", label: "is", needsValue: true },
  { op: "is_not", label: "is not", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "starts_with", label: "starts with", needsValue: true },
  { op: "ends_with", label: "ends with", needsValue: true },
  { op: "matches", label: "matches regex", needsValue: true },
  { op: "exists", label: "exists", needsValue: false },
  { op: "missing", label: "is missing", needsValue: false },
  { op: "gt", label: "greater than", needsValue: true },
  { op: "lt", label: "less than", needsValue: true },
];

export const CONDITION_FIELDS = [
  "method",
  "path",
  "body.type",
  "header stripe-signature",
  "header content-type",
  "query",
  "response.status",
  "ip",
  "country",
] as const;

export function opLabel(op: ConditionOp): string {
  return CONDITION_OPS.find((o) => o.op === op)?.label ?? op;
}

export function referencesResponse(conditions: Condition[]): boolean {
  return conditions.some((c) => c.field.trim().startsWith("response."));
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Unquote `"invoice."` → `invoice.` so the UI can show JSON-ish literals. */
function literal(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

/** `5xx`, `4xx` style status class matching for `is`. */
function statusClassMatch(actual: string, expected: string): boolean | null {
  const m = expected.match(/^([1-5])xx$/i);
  if (!m) return null;
  return actual.length === 3 && actual[0] === m[1];
}

export function evaluateCondition(ctx: RequestContext, condition: Condition): { passed: boolean; actual: unknown } {
  const actual = resolvePath(ctx, condition.field);
  const text = asText(actual);
  const expected = literal(condition.value ?? "");
  const ci = condition.field.trim() === "method";
  const a = ci ? text.toUpperCase() : text;
  const e = ci ? expected.toUpperCase() : expected;
  let passed: boolean;
  switch (condition.op) {
    case "is":
      passed = statusClassMatch(a, e) ?? a === e;
      break;
    case "is_not":
      passed = !(statusClassMatch(a, e) ?? a === e);
      break;
    case "contains":
      passed = a.includes(e);
      break;
    case "starts_with":
      passed = a.startsWith(e);
      break;
    case "ends_with":
      passed = a.endsWith(e);
      break;
    case "matches":
      try {
        passed = new RegExp(e).test(a);
      } catch {
        passed = false;
      }
      break;
    case "exists":
      passed = actual !== undefined && actual !== null && actual !== "";
      break;
    case "missing":
      passed = actual === undefined || actual === null || actual === "";
      break;
    case "gt":
      passed = Number(a) > Number(e);
      break;
    case "lt":
      passed = Number(a) < Number(e);
      break;
  }
  return { passed, actual };
}

export function evaluateConditions(ctx: RequestContext, conditions: Condition[]): boolean {
  return conditions.every((c) => evaluateCondition(ctx, c).passed);
}

/** Human description used in the rules list: `method is POST and body.type starts with "invoice."` */
export function describeConditions(conditions: Condition[]): string {
  if (!conditions.length) return "every request";
  return conditions
    .map((c) => {
      const op = opLabel(c.op);
      const needs = CONDITION_OPS.find((o) => o.op === c.op)?.needsValue;
      return needs ? `${c.field} ${op} ${c.value}` : `${c.field} ${op}`;
    })
    .join("  and  ");
}
