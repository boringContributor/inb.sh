import { Button, Spinner } from "@heroui/react";
import { CircleCheck, CircleX, X } from "lucide-react";
import { type DryRunResult, opLabel } from "@inb/shared";
import { CodeView } from "../../components/code.tsx";
import { TonePill } from "../../components/badges.tsx";

function show(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

export function DryRunPanel({
  result,
  pending,
  error,
  onClose,
}: {
  result: DryRunResult | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Dry run result"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-border bg-background-secondary p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold tracking-[0.3px] text-foreground">DRY RUN</span>
        {result && !pending && (
          <TonePill tone={result.matched ? "success" : "warning"} className="rounded-full">
            {result.requestId ? (result.matched ? "Matches" : "No match") : "No requests yet"}
          </TonePill>
        )}
        {result?.requestId && (
          <span className="truncate font-mono text-[11px] text-tertiary">{result.requestId}</span>
        )}
        <span className="flex-1" />
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Close dry run"
          onPress={onClose}
          className="size-6 min-w-6 text-tertiary"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {pending && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner size="sm" /> Running against the last request…
        </div>
      )}
      {error && !pending && <p className="text-xs text-danger">{error}</p>}

      {result && !pending && !result.requestId && (
        <p className="text-xs text-muted">
          Send a request to any endpoint first — dry runs replay the most recent one.
        </p>
      )}

      {result && !pending && result.requestId && (
        <>
          {result.conditions.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {result.conditions.map((c, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-[11px]">
                  {c.passed ? (
                    <CircleCheck
                      className="mt-px size-3.5 shrink-0 text-success"
                      aria-label="passed"
                    />
                  ) : (
                    <CircleX className="mt-px size-3.5 shrink-0 text-danger" aria-label="failed" />
                  )}
                  <span className="min-w-0 break-all">
                    <span className="text-code-key">{c.condition.field}</span>{" "}
                    <span className="text-muted">{opLabel(c.condition.op)}</span>{" "}
                    <span className="text-code-string">{c.condition.value}</span>
                    <span className="text-tertiary"> · actual {show(c.actual)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.transformError && (
            <p className="rounded-lg bg-danger-soft px-2.5 py-2 font-mono text-[11px] text-danger">
              {result.transformError}
            </p>
          )}
          {result.transformed && (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <CodeView
                code={JSON.stringify(result.transformed, null, 2)}
                className="max-h-52 py-2"
                lineNumbers={false}
                wrap
              />
            </div>
          )}
          {result.actions.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.actions.map((a, i) => (
                <li key={i} className="text-xs text-muted">
                  <span className="text-tertiary">→ </span>
                  {result.matched ? a.description : `would skip: ${a.description}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
