import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  Button,
  Description,
  Dropdown,
  FieldError,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
  toast,
} from "@heroui/react";
import { Ellipsis, Eraser, Settings2, Terminal, Trash } from "lucide-react";
import { CliModal } from "./cli-modal.tsx";
import {
  ENDPOINT_ICONS,
  type Endpoint,
  type EndpointIcon,
  type SigningProvider,
  type UpdateEndpointInput,
} from "@inb/shared";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { keys, useUpdateEndpoint } from "../../lib/queries.ts";
import { ENDPOINT_ICON } from "../../components/icons.tsx";

const RETENTION = [1, 3, 7, 14, 30, 90];

const PROVIDERS: { id: SigningProvider | "none"; label: string; hint?: string }[] = [
  { id: "none", label: "No verification" },
  { id: "stripe", label: "Stripe", hint: "Verifies the Stripe-Signature header (whsec_…)" },
  { id: "github", label: "GitHub", hint: "Verifies X-Hub-Signature-256" },
  { id: "shopify", label: "Shopify", hint: "Verifies X-Shopify-Hmac-Sha256" },
  { id: "slack", label: "Slack", hint: "Verifies X-Slack-Signature with the signing secret" },
  {
    id: "hmac-sha256",
    label: "Generic HMAC-SHA256",
    hint: "Hex or base64 digest of the raw body in a header",
  },
];

function EndpointSettingsModal({
  endpoint,
  isOpen,
  onOpenChange,
}: {
  endpoint: Endpoint;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(endpoint.name);
  const [icon, setIcon] = useState<EndpointIcon>(endpoint.icon);
  const [retention, setRetention] = useState(endpoint.retentionDays);
  const [provider, setProvider] = useState<SigningProvider | "none">(
    endpoint.signing?.provider ?? "none",
  );
  const [secret, setSecret] = useState("");
  const [header, setHeader] = useState(endpoint.signing?.header ?? "x-signature");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateEndpoint(endpoint.id);

  const providerChanged = provider !== (endpoint.signing?.provider ?? "none");
  const headerChanged =
    provider === "hmac-sha256" && header !== (endpoint.signing?.header ?? "x-signature");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input: UpdateEndpointInput = {};
    if (name.trim() && name.trim() !== endpoint.name) input.name = name.trim();
    if (icon !== endpoint.icon) input.icon = icon;
    if (retention !== endpoint.retentionDays) input.retentionDays = retention;
    if (provider === "none") {
      if (endpoint.signing) input.signing = null;
    } else if (secret || providerChanged || headerChanged) {
      // the API keeps the stored secret when none is sent
      if (!secret && !endpoint.signing?.hasSecret) {
        setError("Enter the signing secret to turn on verification");
        return;
      }
      input.signing = {
        provider,
        ...(secret && { secret }),
        ...(provider === "hmac-sha256" && { header }),
      };
    }
    if (!Object.keys(input).length) {
      onOpenChange(false);
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        toast.success("Endpoint saved");
        setSecret("");
        onOpenChange(false);
      },
    });
  };

  const hint = PROVIDERS.find((p) => p.id === provider)?.hint;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[480px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Endpoint settings</Modal.Heading>
          </Modal.Header>
          <form onSubmit={save}>
            <Modal.Body className="flex flex-col gap-5">
              <TextField value={name} onChange={setName} isRequired>
                <Label>Name</Label>
                <Input />
              </TextField>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Icon</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
                  {ENDPOINT_ICONS.map((key) => {
                    const Icon = ENDPOINT_ICON[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={icon === key}
                        aria-label={key}
                        onClick={() => setIcon(key)}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                          icon === key
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border text-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <Select value={String(retention)} onChange={(k) => setRetention(Number(k))}>
                <Label>Retention</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {RETENTION.map((d) => (
                      <ListBox.Item key={d} id={String(d)} textValue={`${d} days`}>
                        {d === 1 ? "1 day" : `${d} days`}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
                <Description>
                  Requests older than this are deleted automatically. Archived requests are kept.
                </Description>
              </Select>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
                <Select
                  value={provider}
                  onChange={(k) => {
                    setProvider(String(k) as SigningProvider | "none");
                    setError(null);
                  }}
                >
                  <Label>Signature verification</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {PROVIDERS.map((p) => (
                        <ListBox.Item key={p.id} id={p.id} textValue={p.label}>
                          {p.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                  {hint && <Description>{hint}</Description>}
                </Select>
                {provider !== "none" && (
                  <>
                    <TextField
                      value={secret}
                      onChange={(v) => {
                        setSecret(v);
                        setError(null);
                      }}
                      type="password"
                      isInvalid={!!error}
                    >
                      <Label>Signing secret</Label>
                      <Input
                        placeholder={
                          endpoint.signing?.hasSecret ? "•••••••• (unchanged)" : "whsec_…"
                        }
                        className="font-mono"
                        autoComplete="off"
                      />
                      <FieldError>{error}</FieldError>
                    </TextField>
                    {provider === "hmac-sha256" && (
                      <TextField value={header} onChange={setHeader}>
                        <Label>Signature header</Label>
                        <Input className="font-mono" />
                      </TextField>
                    )}
                  </>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button type="submit" isPending={update.isPending} isDisabled={!name.trim()}>
                Save
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[420px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-sm text-muted">{body}</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button slot="close" variant="tertiary">
              Cancel
            </Button>
            <Button variant="danger" isPending={pending} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

export function EndpointMenu({ endpoint }: { endpoint: Endpoint }) {
  const [dialog, setDialog] = useState<"settings" | "cli" | "clear" | "delete" | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const clear = useMutation({
    mutationFn: () => api.clearRequests(endpoint.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.requestsFor(endpoint.id) });
      void qc.invalidateQueries({ queryKey: keys.endpoints });
      toast.success("Requests cleared");
      setDialog(null);
      void navigate({ to: "/e/$endpointId", params: { endpointId: endpoint.id }, search: {} });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteEndpoint(endpoint.id),
    onSuccess: () => {
      qc.setQueryData<Endpoint[]>(keys.endpoints, (list) =>
        list?.filter((e) => e.id !== endpoint.id),
      );
      qc.removeQueries({ queryKey: keys.requestsFor(endpoint.id) });
      toast.success(`Deleted ${endpoint.name}`);
      setDialog(null);
      void navigate({ to: "/" });
    },
  });

  return (
    <>
      <Dropdown>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Endpoint actions"
          className="size-9 min-w-9 rounded-lg text-muted"
        >
          <Ellipsis className="size-4" />
        </Button>
        <Dropdown.Popover placement="bottom end" className="min-w-52">
          <Dropdown.Menu
            onAction={(key) => setDialog(String(key) as "settings" | "cli" | "clear" | "delete")}
          >
            <Dropdown.Item id="cli" textValue="Use from the CLI">
              <Terminal className="size-4 text-muted" />
              <Label>Use from the CLI</Label>
            </Dropdown.Item>
            <Dropdown.Item id="settings" textValue="Endpoint settings">
              <Settings2 className="size-4 text-muted" />
              <Label>Endpoint settings</Label>
            </Dropdown.Item>
            <Dropdown.Item id="clear" textValue="Clear requests">
              <Eraser className="size-4 text-muted" />
              <Label>Clear requests</Label>
            </Dropdown.Item>
            <Dropdown.Item id="delete" textValue="Delete endpoint" variant="danger">
              <Trash className="size-4" />
              <Label>Delete endpoint</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <CliModal
        endpoint={endpoint}
        isOpen={dialog === "cli"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      {dialog === "settings" && (
        <EndpointSettingsModal
          endpoint={endpoint}
          isOpen
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={dialog === "clear"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Clear all requests?"
        body={`Every captured request on ${endpoint.name} is deleted. Archived requests are kept. This can't be undone.`}
        confirmLabel="Clear requests"
        pending={clear.isPending}
        onConfirm={() => clear.mutate()}
      />
      <ConfirmDialog
        isOpen={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${endpoint.name}?`}
        body="The URL stops accepting requests immediately and its history is removed. Senders will get 404s."
        confirmLabel="Delete endpoint"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
