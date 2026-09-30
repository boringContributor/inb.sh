import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, Button, Dropdown, Label, Skeleton, Tooltip, toast } from "@heroui/react";
import { BookOpen, Ellipsis, Plug, Plus } from "lucide-react";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATIONS,
  type Integration,
  type IntegrationCategory,
  type IntegrationDefinition,
  formatCount,
  formatPercent,
  formatRelative,
  integrationDefinition,
} from "@inb/shared";
import { api } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { keys, useConfig, useIntegrations } from "../../lib/queries.ts";
import { iconByName } from "../../components/icons.tsx";
import { PageBody, PageTitle, Topbar } from "../../components/page.tsx";
import { TonePill } from "../../components/badges.tsx";
import { ConnectModal, type ConnectTarget } from "./connect-modal.tsx";
import { DeliveryLog } from "./delivery-log.tsx";

const HEALTH_DOT: Record<Integration["health"], { cls: string; label: string }> = {
  ok: { cls: "bg-success", label: "Healthy" },
  degraded: { cls: "bg-warning", label: "Some deliveries failing" },
  failing: { cls: "bg-danger", label: "Deliveries failing" },
  idle: { cls: "bg-tertiary", label: "No deliveries in 24h" },
};

function LogoTile({ icon, size = "md" }: { icon: string; size?: "md" | "sm" }) {
  const Icon = iconByName(icon);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-background-secondary text-foreground",
        size === "md" ? "size-[34px]" : "size-7",
      )}
    >
      <Icon className={size === "md" ? "size-[17px]" : "size-3.5"} />
    </span>
  );
}

function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="min-w-0 flex-1 truncate text-xs text-tertiary">{subtitle}</p>
      {action}
    </div>
  );
}

const linkClass =
  "whitespace-nowrap rounded text-xs font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus";

/** 24 hourly buckets; the last 4 are the "now" window and render solid. */
function Sparkline({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  return (
    <div
      className="flex h-11 w-full items-end gap-[3px]"
      role="img"
      aria-label="Deliveries per hour, last 24 hours"
    >
      {series.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[2px]",
            i >= series.length - 4 ? "bg-accent" : "bg-accent-soft",
          )}
          style={{ height: `${Math.max(4, Math.round((v / max) * 44))}px` }}
          title={`${v} deliveries`}
        />
      ))}
    </div>
  );
}

function ConnectedCard({
  integration,
  onEdit,
  onDelete,
}: {
  integration: Integration;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const def = integrationDefinition(integration.kind);
  const dot = integration.enabled
    ? HEALTH_DOT[integration.health]
    : { cls: "bg-tertiary", label: "Disabled" };

  const toggle = useMutation({
    mutationFn: () => api.updateIntegration(integration.id, { enabled: !integration.enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.integrations }),
  });
  const test = useMutation({
    mutationFn: () => api.testIntegration(integration.id),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test delivered to ${integration.name} · ${r.status}`);
      else toast.danger(`Test to ${integration.name} failed: ${r.error ?? r.status}`);
      void qc.invalidateQueries({ queryKey: keys.integrations });
    },
  });

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3.5",
        !integration.enabled && "opacity-60",
      )}
    >
      <div className="flex w-full items-center gap-2.5">
        <LogoTile icon={def.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-[13.5px] font-semibold text-foreground">
            {integration.name}
          </h3>
          <p className="truncate font-mono text-[11px] text-tertiary">
            {integration.target || def.name}
          </p>
        </div>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={dot.label}
            className="size-6 min-w-6"
          >
            <span className={cn("size-[7px] rounded-full", dot.cls)} />
          </Button>
          <Tooltip.Content>{dot.label}</Tooltip.Content>
        </Tooltip>
        <Dropdown>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={`${integration.name} actions`}
            className="size-[26px] min-w-[26px] text-muted"
          >
            <Ellipsis className="size-3.5" />
          </Button>
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "edit") onEdit();
                if (key === "test") test.mutate();
                if (key === "toggle") toggle.mutate();
                if (key === "delete") onDelete();
              }}
            >
              <Dropdown.Item id="edit" textValue="Edit">
                <Label>Edit</Label>
              </Dropdown.Item>
              <Dropdown.Item id="test" textValue="Send test">
                <Label>Send test</Label>
              </Dropdown.Item>
              <Dropdown.Item id="toggle" textValue={integration.enabled ? "Disable" : "Enable"}>
                <Label>{integration.enabled ? "Disable" : "Enable"}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                <Label>Delete</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <Sparkline series={integration.series} />
      <div className="flex w-full items-center gap-2 text-[11.5px]">
        <span className="whitespace-nowrap font-medium text-muted">
          {formatCount(integration.stats.delivered)} delivered
        </span>
        <span className="text-[11px] text-tertiary">·</span>
        <span className="min-w-0 flex-1 truncate text-tertiary">
          {formatPercent(integration.stats.okRate)} ok
        </span>
        <span className="whitespace-nowrap text-[11px] text-tertiary">
          {integration.stats.lastDeliveryAt
            ? formatRelative(integration.stats.lastDeliveryAt)
            : "no deliveries"}
        </span>
      </div>
    </article>
  );
}

function CatalogCard({ def, onConnect }: { def: IntegrationDefinition; onConnect: () => void }) {
  const soon = def.transport === "unsupported";
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-border bg-surface p-3.5">
      <LogoTile icon={def.icon} />
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-foreground">{def.name}</h3>
        <p className="text-[11.5px] leading-[17px] text-tertiary">{def.description}</p>
      </div>
      <div className="mt-auto flex w-full items-center gap-2">
        <span className="flex-1 text-[10.5px] text-tertiary">{def.category}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-[26px] rounded-sm px-[11px] text-[11.5px]"
          isDisabled={soon}
          onPress={onConnect}
        >
          {soon ? "Soon" : "Connect"}
        </Button>
      </div>
    </article>
  );
}

export function IntegrationsPage() {
  const { data: integrations, isPending } = useIntegrations();
  const { data: config } = useConfig();
  const search = useSearch({ strict: false }) as { category?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [target, setTarget] = useState<ConnectTarget | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Integration | null>(null);

  const category = INTEGRATION_CATEGORIES.find((c) => c === search.category) ?? null;
  const catalog = category ? INTEGRATIONS.filter((i) => i.category === category) : INTEGRATIONS;
  const setCategory = (c: IntegrationCategory | null) =>
    void navigate({ to: "/integrations", search: c ? { category: c } : {}, replace: true });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteIntegration(id),
    onSuccess: () => {
      toast(`${deleting?.name ?? "Integration"} removed`);
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: keys.integrations });
    },
  });

  const repo = config?.githubRepo ?? "boringContributor/inb.sh";
  const connectedCount = integrations?.length ?? 0;

  return (
    <>
      <Topbar
        left={
          <>
            <PageTitle>Integrations</PageTitle>
            {connectedCount > 0 && (
              <TonePill tone="success" className="text-xs">
                {connectedCount} connected
              </TonePill>
            )}
          </>
        }
        right={
          <>
            <a
              href={`https://github.com/${repo}#integrations`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-muted outline-none transition-colors hover:bg-default/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
            >
              <BookOpen className="size-4" />
              Docs
            </a>
            <Button onPress={() => setTarget({ mode: "pick" })}>
              <Plus className="size-4" />
              Add integration
            </Button>
          </>
        }
      />
      <PageBody className="flex flex-col gap-[18px] px-6 py-5">
        <section className="flex flex-col gap-3" aria-label="Connected integrations">
          <SectionHead
            title="Connected"
            subtitle="Everything inb.sh is forwarding to right now"
            action={
              <button type="button" className={linkClass} onClick={() => setLogOpen(true)}>
                Delivery log
              </button>
            }
          />
          {isPending ? (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-[142px] rounded-lg" />
              ))}
            </div>
          ) : connectedCount === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Plug className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">Nothing connected yet</p>
                <p className="mt-1 text-xs text-muted">
                  Connect a destination below, then add a rule with a “Forward” action to start
                  shipping requests.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {integrations!.map((i) => (
                <ConnectedCard
                  key={i.id}
                  integration={i}
                  onEdit={() => setTarget({ mode: "edit", integration: i })}
                  onDelete={() => setDeleting(i)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label="Available integrations">
          <SectionHead
            title="Available"
            subtitle="Ship a request anywhere. Or write your own in 40 lines."
            action={
              <a
                href={`https://github.com/${repo}/blob/main/apps/worker/src/deliver/send.ts`}
                target="_blank"
                rel="noreferrer"
                className={linkClass}
              >
                Build an integration
              </a>
            }
          />
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by category"
          >
            {[null, ...INTEGRATION_CATEGORIES].map((c) => {
              const active = c === category;
              return (
                <button
                  key={c ?? "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "flex h-[26px] items-center rounded-sm px-[11px] text-[11.5px] font-medium outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-focus",
                    active
                      ? "bg-default text-foreground"
                      : "border border-border text-tertiary hover:text-foreground",
                  )}
                >
                  {c ?? `All ${INTEGRATIONS.length}`}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {catalog.map((def) => (
              <CatalogCard
                key={def.kind}
                def={def}
                onConnect={() => setTarget({ mode: "create", kind: def.kind })}
              />
            ))}
          </div>
        </section>
      </PageBody>

      <ConnectModal target={target} onClose={() => setTarget(null)} />
      <DeliveryLog isOpen={logOpen} onOpenChange={setLogOpen} integrations={integrations ?? []} />

      <AlertDialog.Backdrop isOpen={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Remove {deleting?.name}?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm text-muted">
                Rules that forward to this integration will skip it. Its delivery history stays in
                the log for 30 days.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button
                variant="danger"
                isPending={remove.isPending}
                onPress={() => deleting && remove.mutate(deleting.id)}
              >
                Remove
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
