import { useEffect, useState } from "react";
import { Button, Modal, Spinner } from "@heroui/react";
import { Sparkles } from "lucide-react";
import type { DryRunResult } from "@inb/shared";
import { CodeEditor } from "../../components/code-editor.tsx";
import { CodeView } from "../../components/code.tsx";
import { ApiError, api } from "../../lib/api.ts";
import type { Draft } from "./rule-utils.ts";

const HELP = [
  ["$", "the request: method, path, query, headers, body"],
  ["$pick(obj, 'a', 'b')", "keep only these keys"],
  ["$mask(value)", "•••• all but the last 4 characters"],
  ["$merge([a, b])", "shallow merge objects"],
];

/**
 * Full-size JSONata editor with a live preview: every pause in typing
 * dry-runs the draft rule against the most recent captured request.
 */
export function TransformModal({
  isOpen,
  onOpenChange,
  draft,
  onApply,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  onApply: (transform: string) => void;
}) {
  const [source, setSource] = useState(draft.transform ?? "");
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setSource(draft.transform ?? "");
    // only reseed when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const result = await api.dryRun({
          rule: { ...draft, transform: source.trim() ? source : null },
          endpointId: draft.endpointId ?? undefined,
        });
        if (!cancelled) {
          setPreview(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Preview failed");
      } finally {
        if (!cancelled) setPending(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // draft identity changes on every parent render; the transform source is what matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isOpen, draft.endpointId]);

  const output = preview?.transformError
    ? null
    : preview?.transformed
      ? JSON.stringify(preview.transformed, null, 2)
      : null;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="lg">
        <Modal.Dialog className="sm:max-w-[1040px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent">
              <Sparkles className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Transform · {draft.name}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-xs font-medium text-muted">JSONata expression</span>
              <div className="overflow-hidden rounded-xl border border-border bg-background">
                <CodeEditor
                  ariaLabel="Transform expression"
                  language="jsonata"
                  value={source}
                  onChange={setSource}
                  minHeight="340px"
                  maxHeight="52vh"
                  placeholder="$merge([$, { … }])"
                />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {HELP.map(([code, text]) => (
                  <div key={code} className="contents">
                    <dt className="font-mono text-code-template">{code}</dt>
                    <dd className="text-tertiary">{text}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-muted">
                Output on {preview?.requestId ? <span className="font-mono text-tertiary">{preview.requestId}</span> : "the last request"}
                {pending && <Spinner size="sm" />}
              </span>
              <div className="min-h-[340px] overflow-hidden rounded-xl border border-border bg-background">
                {error && <p className="p-3 text-xs text-danger">{error}</p>}
                {preview?.transformError && (
                  <p className="p-3 font-mono text-[11.5px] leading-relaxed text-danger">{preview.transformError}</p>
                )}
                {preview && !preview.requestId && (
                  <p className="p-3 text-xs text-muted">No captured requests yet — send one to preview the output.</p>
                )}
                {!source.trim() && preview?.requestId && (
                  <p className="p-3 text-xs text-muted">Without a transform, the request is forwarded unchanged.</p>
                )}
                {output && <CodeView code={output} className="max-h-[52vh]" wrap />}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">
              Cancel
            </Button>
            <Button
              isDisabled={!!preview?.transformError}
              onPress={() => {
                onApply(source);
                onOpenChange(false);
              }}
            >
              Use transform
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
