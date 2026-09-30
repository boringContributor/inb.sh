import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Description, FieldError, Input, Label, Modal, TextField } from "@heroui/react";
import { Inbox } from "lucide-react";
import { ENDPOINT_ICONS, type Endpoint, type EndpointIcon, slugSchema } from "@inb/shared";
import { ApiError, api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { keys, useConfig } from "../lib/queries.ts";
import { ENDPOINT_ICON } from "./icons.tsx";

export function NewEndpointModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState<EndpointIcon>("webhook");
  const [slugError, setSlugError] = useState<string | null>(null);
  const { data: config } = useConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: () => api.createEndpoint({ name: name.trim(), icon, slug: slug.trim() || undefined }),
    onSuccess: (endpoint) => {
      qc.setQueryData<Endpoint[]>(keys.endpoints, (list) => [...(list ?? []), endpoint]);
      onOpenChange(false);
      setName("");
      setSlug("");
      setIcon("webhook");
      void navigate({ to: "/e/$endpointId", params: { endpointId: endpoint.id } });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "slug_taken") setSlugError("That path is already taken");
    },
  });

  const validateSlug = (value: string) => {
    if (!value) return null;
    const r = slugSchema.safeParse(value);
    return r.success ? null : "3–48 lowercase letters, digits or dashes";
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const err = validateSlug(slug.trim());
    setSlugError(err);
    if (!name.trim() || err) return;
    create.mutate();
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[440px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent">
              <Inbox className="size-5" />
            </Modal.Icon>
            <Modal.Heading>New endpoint</Modal.Heading>
          </Modal.Header>
          <form onSubmit={submit}>
            <Modal.Body className="flex flex-col gap-4">
              <TextField value={name} onChange={setName} isRequired autoFocus>
                <Label>Name</Label>
                <Input placeholder="Stripe webhooks" />
              </TextField>
              <TextField
                value={slug}
                onChange={(v) => {
                  setSlug(v.toLowerCase());
                  setSlugError(null);
                }}
                isInvalid={!!slugError}
              >
                <Label>Path</Label>
                <Input placeholder="random" className="font-mono" />
                {slugError ? (
                  <FieldError>{slugError}</FieldError>
                ) : (
                  <Description className="font-mono text-xs">
                    {config?.captureBaseUrl ?? ""}/{slug || "xxxx-xxxx-xxxx"}
                  </Description>
                )}
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
                          icon === key ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button type="submit" isDisabled={!name.trim()} isPending={create.isPending}>
                Create endpoint
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
