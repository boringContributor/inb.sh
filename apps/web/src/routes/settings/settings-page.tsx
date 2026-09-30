import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, NumberField, Skeleton, TextField, toast } from "@heroui/react";
import { KeyRound, LogOut, Server, Timer, UserRound } from "lucide-react";
import type { Endpoint } from "@inb/shared";
import { api } from "../../lib/api.ts";
import { keys, useConfig, useEndpoints, useSettings } from "../../lib/queries.ts";
import { ENDPOINT_ICON } from "../../components/icons.tsx";
import { CopyButton } from "../../components/code.tsx";
import { PageBody, PageTitle, Panel, PanelHeader, Topbar } from "../../components/page.tsx";

function WorkspacePanel() {
  const { data, isPending } = useSettings();
  const qc = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState("");
  const [userName, setUserName] = useState("");
  useEffect(() => {
    if (data) {
      setWorkspaceName(data.workspaceName);
      setUserName(data.userName);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.updateSettings({ workspaceName: workspaceName.trim(), userName: userName.trim() }),
    onSuccess: () => {
      toast.success("Settings saved");
      void qc.invalidateQueries({ queryKey: keys.settings });
      void qc.invalidateQueries({ queryKey: keys.config });
    },
  });
  const dirty = !!data && (workspaceName.trim() !== data.workspaceName || userName.trim() !== data.userName);

  return (
    <Panel>
      <PanelHeader icon={<UserRound />} title="Workspace" />
      <form
        className="flex flex-col gap-4 border-t border-separator p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && workspaceName.trim() && userName.trim()) save.mutate();
        }}
      >
        {isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField value={workspaceName} onChange={setWorkspaceName} isRequired>
              <Label>Workspace name</Label>
              <Input placeholder="inb.sh" />
            </TextField>
            <TextField value={userName} onChange={setUserName} isRequired>
              <Label>Your display name</Label>
              <Input placeholder="Admin" />
            </TextField>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" isDisabled={!dirty} isPending={save.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Mono({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-background py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{children}</code>
      <CopyButton text={children} />
    </div>
  );
}

function DeploymentPanel() {
  const { data: config } = useConfig();
  return (
    <Panel>
      <PanelHeader icon={<Server />} title="Deployment" />
      <div className="flex flex-col gap-4 border-t border-separator p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Capture base URL</span>
          {config ? <Mono>{`${config.captureBaseUrl}/<slug>`}</Mono> : <Skeleton className="h-9 rounded-xl" />}
          <p className="text-xs text-tertiary">
            Set <code className="font-mono text-muted">INBOUND_DOMAIN</code> before deploying to capture on your own domain.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-3.5 text-muted" />
            Secrets
          </span>
          <Mono>sst secret set AdminPassword &lt;password&gt; --stage production</Mono>
          <Mono>sst secret set SessionSecret &lt;random-64-chars&gt; --stage production</Mono>
          <p className="text-xs text-tertiary">
            Rotating SessionSecret signs everyone out. The admin password also works as a bearer token for the API.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function RetentionRow({ endpoint }: { endpoint: Endpoint }) {
  const qc = useQueryClient();
  const [days, setDays] = useState(endpoint.retentionDays);
  useEffect(() => setDays(endpoint.retentionDays), [endpoint.retentionDays]);
  const save = useMutation({
    mutationFn: (retentionDays: number) => api.updateEndpoint(endpoint.id, { retentionDays }),
    onSuccess: (updated) => {
      toast.success(`${updated.name} keeps requests for ${updated.retentionDays} days`);
      qc.setQueryData<Endpoint[]>(keys.endpoints, (list) => list?.map((e) => (e.id === updated.id ? updated : e)));
      qc.setQueryData(keys.endpoint(updated.id), updated);
    },
  });
  const Icon = ENDPOINT_ICON[endpoint.icon];
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="size-4 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{endpoint.name}</span>
        <span className="truncate font-mono text-[11px] text-tertiary">{endpoint.slug}</span>
      </div>
      <NumberField
        aria-label={`Retention for ${endpoint.name} in days`}
        value={days}
        minValue={1}
        maxValue={90}
        onChange={(v) => setDays(Number.isFinite(v) ? v : endpoint.retentionDays)}
        className="w-32"
      >
        <NumberField.Group>
          <NumberField.DecrementButton />
          <NumberField.Input className="text-center font-mono" />
          <NumberField.IncrementButton />
        </NumberField.Group>
      </NumberField>
      <span className="w-8 text-xs text-tertiary">days</span>
      <Button
        size="sm"
        variant="secondary"
        isDisabled={days === endpoint.retentionDays}
        isPending={save.isPending}
        onPress={() => save.mutate(days)}
      >
        Apply
      </Button>
    </li>
  );
}

function RetentionPanel() {
  const { data: endpoints, isPending } = useEndpoints();
  return (
    <Panel>
      <PanelHeader icon={<Timer />} title="Retention">
        <span className="text-xs text-tertiary">Requests older than this are deleted hourly. Archived copies stay.</span>
      </PanelHeader>
      <div className="border-t border-separator">
        {isPending && <Skeleton className="m-4 h-12 rounded-xl" />}
        {endpoints?.length === 0 && <p className="px-4 py-5 text-sm text-tertiary">No endpoints yet.</p>}
        <ul className="divide-y divide-separator">
          {endpoints?.map((e) => (
            <RetentionRow key={e.id} endpoint={e} />
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      qc.clear();
      await navigate({ to: "/login", search: {} });
    },
  });

  return (
    <>
      <Topbar
        left={<PageTitle>Settings</PageTitle>}
        right={
          <Button variant="outline" onPress={() => signOut.mutate()} isPending={signOut.isPending}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        }
      />
      <PageBody className="px-6 py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <WorkspacePanel />
          <DeploymentPanel />
          <RetentionPanel />
        </div>
      </PageBody>
    </>
  );
}
