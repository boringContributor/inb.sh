import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
  toast,
} from "@heroui/react";
import {
  INTEGRATIONS,
  type Integration,
  type IntegrationDefinition,
  type IntegrationKind,
  integrationDefinition,
} from "@inb/shared";
import { ApiError, api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { keys } from "../../lib/queries.ts";
import { iconByName } from "../../components/icons.tsx";

const REDACTED = "••••••••";

export type ConnectTarget =
  | { mode: "pick" }
  | { mode: "create"; kind: IntegrationKind }
  | { mode: "edit"; integration: Integration };

function KindPicker({ onPick }: { onPick: (kind: IntegrationKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {INTEGRATIONS.map((def) => {
        const Icon = iconByName(def.icon);
        const soon = def.transport === "unsupported";
        return (
          <button
            key={def.kind}
            type="button"
            disabled={soon}
            onClick={() => onPick(def.kind)}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border border-border p-2.5 text-left outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-focus",
              soon ? "cursor-not-allowed opacity-50" : "hover:bg-default/50",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background-secondary">
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium">{def.name}</span>
              <span className="text-[11px] text-tertiary">
                {soon ? "Coming soon" : def.category}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IntegrationForm({
  def,
  existing,
  onDone,
}: {
  def: IntegrationDefinition;
  existing?: Integration;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? def.name);
  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.fields.map((f) => [f.key, existing?.config[f.key] ?? ""])),
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [saved, setSaved] = useState<Integration | null>(existing ?? null);

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.updateIntegration(existing.id, { name: name.trim(), config })
        : api.createIntegration({ kind: def.kind, name: name.trim(), config }),
    onSuccess: (integration) => {
      setSaved(integration);
      void qc.invalidateQueries({ queryKey: keys.integrations });
      toast.success(existing ? `${integration.name} updated` : `${integration.name} connected`);
      if (existing) onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "missing_fields") {
        setMissing(((err.body as { fields?: string[] })?.fields ?? []).slice());
      } else {
        toast.danger(err instanceof ApiError ? err.message : "Couldn't save the integration");
      }
    },
  });

  const test = useMutation({
    mutationFn: () => api.testIntegration(saved!.id),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test delivered · ${r.status} · ${r.durationMs} ms`);
      else toast.danger(`Test failed: ${r.error ?? r.status}`);
      void qc.invalidateQueries({ queryKey: keys.integrations });
      void qc.invalidateQueries({ queryKey: keys.deliveries() });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const empty = def.fields.filter((f) => !f.optional && !config[f.key]?.trim()).map((f) => f.key);
    setMissing(empty);
    if (empty.length || !name.trim()) return;
    save.mutate();
  };

  const created = !!saved && !existing;

  return (
    <form onSubmit={submit}>
      <Modal.Body className="flex flex-col gap-4">
        {created ? (
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{saved.name}</span> is connected. Add a
            rule with a “Forward” action to start sending requests, or send a test delivery now.
          </p>
        ) : (
          <>
            <TextField value={name} onChange={setName} isRequired>
              <Label>Name</Label>
              <Input placeholder={def.name} />
            </TextField>
            {def.fields.map((field) => {
              const invalid = missing.includes(field.key);
              return (
                <TextField
                  key={field.key}
                  value={config[field.key] ?? ""}
                  onChange={(v) => {
                    setConfig((c) => ({ ...c, [field.key]: v }));
                    setMissing((m) => m.filter((k) => k !== field.key));
                  }}
                  type={field.secret ? "password" : "text"}
                  isRequired={!field.optional}
                  isInvalid={invalid}
                >
                  <Label>{field.label}</Label>
                  <Input
                    placeholder={field.secret && existing ? REDACTED : field.placeholder}
                    className={cn(!field.secret && "font-mono text-[13px]")}
                  />
                  {invalid ? (
                    <FieldError>{field.label} is required</FieldError>
                  ) : field.description ? (
                    <Description>{field.description}</Description>
                  ) : field.secret && existing ? (
                    <Description>
                      Saved value hidden — leave it to keep it, or paste a new one.
                    </Description>
                  ) : null}
                </TextField>
              );
            })}
            {def.fields.length === 0 && (
              <p className="text-sm text-muted">No configuration needed. {def.description}</p>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {saved && (
          <Button variant="secondary" onPress={() => test.mutate()} isPending={test.isPending}>
            Send test
          </Button>
        )}
        {created ? (
          <Button onPress={onDone}>Done</Button>
        ) : (
          <>
            <Button slot="close" variant="secondary">
              Cancel
            </Button>
            <Button type="submit" isPending={save.isPending} isDisabled={!name.trim()}>
              {existing ? "Save" : "Connect"}
            </Button>
          </>
        )}
      </Modal.Footer>
    </form>
  );
}

export function ConnectModal({
  target,
  onClose,
}: {
  target: ConnectTarget | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<IntegrationKind | null>(null);
  useEffect(() => {
    setKind(
      target?.mode === "create"
        ? target.kind
        : target?.mode === "edit"
          ? target.integration.kind
          : null,
    );
  }, [target]);

  const def = kind ? integrationDefinition(kind) : null;
  const Icon = def ? iconByName(def.icon) : null;
  const existing = target?.mode === "edit" ? target.integration : undefined;

  return (
    <Modal.Backdrop isOpen={!!target} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container scroll="inside">
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            {Icon && (
              <Modal.Icon className="bg-background-secondary text-foreground">
                <Icon className="size-5" />
              </Modal.Icon>
            )}
            <Modal.Heading>
              {existing ? `Edit ${existing.name}` : def ? `Connect ${def.name}` : "Add integration"}
            </Modal.Heading>
            {def && !existing && <p className="text-sm text-muted">{def.description}</p>}
          </Modal.Header>
          {def ? (
            <IntegrationForm
              key={`${def.kind}-${existing?.id ?? "new"}`}
              def={def}
              existing={existing}
              onDone={onClose}
            />
          ) : (
            <Modal.Body>
              <KindPicker onPick={setKind} />
            </Modal.Body>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
