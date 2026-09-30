import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Description, FieldError, Input, Label, Modal, TextField, toast } from "@heroui/react";
import { RotateCcw, Sparkles } from "lucide-react";
import { type CapturedRequest, replayableHeaders } from "@inb/shared";
import { ApiError, api } from "../../lib/api.ts";
import { keys } from "../../lib/queries.ts";
import { CodeEditor } from "../../components/code-editor.tsx";
import { base64ToBytes, isPrivateUrl, isValidUrl, readLocal, writeLocal } from "./hooks.ts";

const urlKey = (endpointId: string) => `inb:replay-url:${endpointId}`;
const transformKey = (endpointId: string) => `inb:replay-transform:${endpointId}`;

export const DEFAULT_REPLAY_TRANSFORM = `$merge([$, {
  "headers": $merge([headers, {"x-replayed-by": "inbound"}])
}])`;

/**
 * Replay a captured request from the browser. Used for localhost / private
 * targets the worker can't reach. Headers the browser refuses to set
 * (host, content-length, …) are dropped silently by fetch.
 */
async function replayFromBrowser(request: CapturedRequest, url: string): Promise<{ status: number | null; error: string | null }> {
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : request.bodyEncoding === "base64"
        ? (base64ToBytes(request.body) as BodyInit)
        : request.body;
  const headers = new Headers();
  for (const [k, v] of replayableHeaders(request.headers)) {
    try {
      headers.append(k, v);
    } catch {
      /* forbidden or malformed header name */
    }
  }
  headers.set("x-inbound-replay", request.id);
  try {
    const res = await fetch(url, { method, headers, body, mode: "cors", credentials: "omit", redirect: "manual" });
    return { status: res.status || null, error: null };
  } catch {
    return {
      status: null,
      error:
        "The browser blocked the request. Your local server must allow CORS from this origin (Access-Control-Allow-Origin), or use a CLI tunnel.",
    };
  }
}

function useReplay(endpointId: string, request: CapturedRequest) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.request(endpointId, request.id) });
    void qc.invalidateQueries({ queryKey: keys.requestsFor(endpointId) });
  };

  const run = async (url: string, transform?: string): Promise<boolean> => {
    setPending(true);
    try {
      if (isPrivateUrl(url)) {
        const result = await replayFromBrowser(request, url);
        if (result.error) {
          toast.danger(result.error, { timeout: 8000 });
          return false;
        }
        await api.reportReplay(endpointId, request.id, { url, status: result.status });
        toast.success(`Replayed to ${new URL(url).host} · ${result.status ?? "opaque response"}`);
        refresh();
        return true;
      }
      const result = await api.replay(endpointId, request.id, { url, transform });
      if (result.ok) toast.success(`Replayed · ${result.status} in ${result.durationMs} ms`);
      else toast.danger(`Replay failed · ${result.error ?? result.status}`, { timeout: 8000 });
      refresh();
      return result.ok;
    } catch (err) {
      toast.danger(err instanceof ApiError ? err.message : "Replay failed");
      return false;
    } finally {
      setPending(false);
    }
  };

  return { run, pending };
}

function TargetField({ url, onChange, error }: { url: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <TextField value={url} onChange={onChange} isInvalid={!!error} isRequired autoFocus>
      <Label>Target URL</Label>
      <Input placeholder="http://localhost:4000/webhooks" className="font-mono" />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <Description>
          {url && isPrivateUrl(url)
            ? "Private address — replayed from your browser, so your server must allow CORS."
            : "Public URLs are replayed from the edge with the original method, headers and body."}
        </Description>
      )}
    </TextField>
  );
}

export function ReplayModal({
  endpointId,
  request,
  isOpen,
  onOpenChange,
}: {
  endpointId: string;
  request: CapturedRequest;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState(() => readLocal(urlKey(endpointId)) ?? "");
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useReplay(endpointId, request);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const target = url.trim();
    if (!isValidUrl(target)) {
      setError("Enter an http(s) URL");
      return;
    }
    writeLocal(urlKey(endpointId), target);
    if (await run(target)) onOpenChange(false);
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[460px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent">
              <RotateCcw className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Replay request</Modal.Heading>
          </Modal.Header>
          <form onSubmit={submit}>
            <Modal.Body>
              <TargetField
                url={url}
                onChange={(v) => {
                  setUrl(v);
                  setError(null);
                }}
                error={error}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button type="submit" isPending={pending} isDisabled={!url.trim()}>
                <RotateCcw className="size-4" />
                Replay
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export function TransformReplayModal({
  endpointId,
  request,
  isOpen,
  onOpenChange,
}: {
  endpointId: string;
  request: CapturedRequest;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState(() => readLocal(urlKey(endpointId)) ?? "");
  const [transform, setTransform] = useState(() => readLocal(transformKey(endpointId)) ?? DEFAULT_REPLAY_TRANSFORM);
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useReplay(endpointId, request);
  const privateTarget = !!url.trim() && isPrivateUrl(url.trim());

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const target = url.trim();
    if (!isValidUrl(target)) {
      setError("Enter an http(s) URL");
      return;
    }
    writeLocal(urlKey(endpointId), target);
    writeLocal(transformKey(endpointId), transform);
    if (await run(target, transform)) onOpenChange(false);
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="lg">
        <Modal.Dialog className="sm:max-w-[640px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent">
              <Sparkles className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Transform &amp; replay</Modal.Heading>
          </Modal.Header>
          <form onSubmit={submit}>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Transform</span>
                  <a
                    href="https://docs.jsonata.org/overview"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    JSONata reference
                  </a>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <CodeEditor
                    value={transform}
                    onChange={setTransform}
                    language="jsonata"
                    minHeight="160px"
                    maxHeight="320px"
                    ariaLabel="Transform expression"
                  />
                </div>
                <p className="text-xs text-tertiary">
                  Evaluated against <code className="font-mono text-muted">{"{ method, path, query, headers, body }"}</code>.
                  Return an object with any of those keys to override them, or anything else to replace the body.
                  Helpers: <code className="font-mono text-muted">$pick(obj, "a", "b")</code>,{" "}
                  <code className="font-mono text-muted">$mask(str)</code>.
                </p>
              </div>
              <TargetField
                url={url}
                onChange={(v) => {
                  setUrl(v);
                  setError(null);
                }}
                error={error ?? (privateTarget ? "Transforms run at the edge, so the target must be publicly reachable." : null)}
              />
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button type="submit" isPending={pending} isDisabled={!url.trim() || privateTarget || !transform.trim()}>
                <Sparkles className="size-4" />
                Transform &amp; replay
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
