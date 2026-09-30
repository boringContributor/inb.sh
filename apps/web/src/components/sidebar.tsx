import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, Dropdown, Label, Skeleton } from "@heroui/react";
import { Archive, ChevronsUpDown, LogOut, Plug, Plus, Settings, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { useConfig, useEndpoints } from "../lib/queries.ts";
import { ENDPOINT_ICON } from "./icons.tsx";
import { GithubIcon } from "./brand-icons.tsx";
import { BrandMark, Wordmark } from "./brand.tsx";
import { NewEndpointModal } from "./new-endpoint-modal.tsx";

function NavItem({
  to,
  params,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  params?: Record<string, string>;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "flex h-9 w-full shrink-0 items-center gap-3 rounded-2xl px-2 py-1.5 text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-focus",
        active ? "bg-default font-medium text-foreground" : "text-muted hover:bg-default/50 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

const SectionTitle = ({ children }: { children: string }) => (
  <div className="flex w-full items-center px-2 py-1.5 text-xs font-medium tracking-wide text-muted">{children}</div>
);

const Divider = () => (
  <div className="w-full py-1">
    <div className="h-px w-full bg-separator" />
  </div>
);

function formatStars(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: endpoints, isPending } = useEndpoints();
  const { data: config } = useConfig();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await api.logout();
    qc.clear();
    await navigate({ to: "/login" });
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-1 border-r border-separator bg-surface px-3 py-4">
      <Link to="/" className="flex h-10 w-full items-center gap-2.5 rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <BrandMark size={28} />
        <span className="flex min-w-0 flex-1 flex-col">
          <Wordmark className="text-[15px] leading-tight" />
          <span className="text-[11px] leading-tight text-tertiary">inbox for HTTP</span>
        </span>
      </Link>

      <div className="h-3 shrink-0" />
      <Button variant="outline" fullWidth className="h-9 rounded-3xl" onPress={() => setCreating(true)}>
        <Plus className="size-4" />
        New endpoint
      </Button>
      <div className="h-3 shrink-0" />

      <nav aria-label="Endpoints" className="flex min-h-0 flex-col gap-1">
        <SectionTitle>ENDPOINTS</SectionTitle>
        <div className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
          {isPending &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-9 w-full shrink-0 rounded-2xl" />)}
          {endpoints?.map((e) => (
            <NavItem
              key={e.id}
              to="/e/$endpointId"
              params={{ endpointId: e.id }}
              icon={ENDPOINT_ICON[e.icon]}
              label={e.name}
              active={pathname.startsWith(`/e/${e.id}`)}
            />
          ))}
          {endpoints?.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-tertiary">No endpoints yet — create one to get a URL.</p>
          )}
        </div>
      </nav>

      <Divider />
      <nav aria-label="Workspace" className="flex flex-col gap-1">
        <SectionTitle>WORKSPACE</SectionTitle>
        <NavItem to="/rules" icon={SlidersHorizontal} label="Rules" active={pathname.startsWith("/rules")} />
        <NavItem to="/integrations" icon={Plug} label="Integrations" active={pathname.startsWith("/integrations")} />
        <NavItem to="/archive" icon={Archive} label="Archive" active={pathname.startsWith("/archive")} />
        <NavItem to="/settings" icon={Settings} label="Settings" active={pathname.startsWith("/settings")} />
      </nav>

      <div className="min-h-4 flex-1" />

      {config && (
        <a
          href={`https://github.com/${config.githubRepo}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-2 rounded-xl bg-background-secondary px-2.5 py-2 text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
        >
          <GithubIcon className="size-4" />
          <span className="flex-1 text-xs font-medium">Star on GitHub</span>
          {config.githubStars !== null && (
            <span className="font-mono text-[11px] text-tertiary">{formatStars(config.githubStars)}</span>
          )}
        </a>
      )}
      <Divider />
      <Dropdown>
        <Button
          variant="ghost"
          fullWidth
          aria-label="Account menu"
          className="h-auto justify-start gap-2.5 rounded-2xl p-1 text-left"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-default text-xs font-medium text-foreground">
            {config?.user?.initials ?? "··"}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium text-foreground">{config?.user?.name ?? "—"}</span>
            <span className="text-[11px] font-normal text-tertiary">{config?.user?.plan ?? "Self-hosted"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted" />
        </Button>
        <Dropdown.Popover placement="top start" className="min-w-52">
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "settings") void navigate({ to: "/settings" });
              if (key === "logout") void signOut();
            }}
          >
            <Dropdown.Item id="settings" textValue="Settings">
              <Settings className="size-4 text-muted" />
              <Label>Settings</Label>
            </Dropdown.Item>
            <Dropdown.Item id="logout" textValue="Sign out" variant="danger">
              <LogOut className="size-4" />
              <Label>Sign out</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <NewEndpointModal isOpen={creating} onOpenChange={setCreating} />
    </aside>
  );
}
