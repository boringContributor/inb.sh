import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Modal, Skeleton } from "@heroui/react";
import { Terminal } from "lucide-react";
import type { Endpoint } from "@inb/shared";
import { api } from "../../lib/api.ts";
import { usePlan } from "../../lib/plan.ts";
import { CodeView, CopyButton } from "../../components/code.tsx";

/**
 * `npx inb.sh listen …` with this workspace's token filled in, so forwarding
 * to localhost is one paste away.
 */
export function CliModal({
  endpoint,
  isOpen,
  onOpenChange,
}: {
  endpoint: Endpoint;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isPublic } = usePlan();
  const [port, setPort] = useState("3000");
  const { data, isPending } = useQuery({
    queryKey: ["cli-token"],
    queryFn: api.cliToken,
    enabled: isOpen && isPublic,
    staleTime: Infinity,
  });

  const origin = location.origin;
  const defaultOrigin = origin === "https://app.inb.sh";
  const token = isPublic ? (data?.token ?? "…") : "<admin password>";
  const command = [
    `npx inb.sh listen ${endpoint.id}`,
    `  --to http://localhost:${port || "3000"}`,
    ...(defaultOrigin ? [] : [`  --url ${origin}`]),
    `  --token ${token}`,
  ].join(" \\\n");

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-default text-foreground">
              <Terminal className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Forward to localhost</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted">
              Every request {endpoint.name} receives is printed in your terminal and forwarded to
              your local server. Rules with a “Replay to localhost” action go through it too.
            </p>
            <label className="flex items-center gap-3 text-sm">
              <span className="text-muted">Local port</span>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
                inputMode="numeric"
                aria-label="Local port"
                className="h-8 w-24 rounded-lg border border-border bg-field px-2.5 font-mono text-[13px] outline-none focus-visible:border-field-border-focus"
              />
            </label>
            <div className="relative rounded-xl border border-border bg-background">
              {isPublic && isPending ? (
                <Skeleton className="m-3 h-20 rounded-lg" />
              ) : (
                <CodeView code={command} language="shell" lineNumbers={false} wrap />
              )}
              <div className="absolute top-2 right-2">
                <CopyButton text={command} label="Copy command" />
              </div>
            </div>
            <p className="text-xs leading-relaxed text-tertiary">
              {isPublic
                ? "The token is your workspace key. Anyone with it can read this workspace's requests, so treat it like a password."
                : "On a private instance the token is the admin password."}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">
              Done
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
