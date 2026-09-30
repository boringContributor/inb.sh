import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, SearchField, Tooltip, toast } from "@heroui/react";
import { Play, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { Integration, Rule } from "@inb/shared";
import { PageTitle, Topbar } from "../../components/page.tsx";
import { api } from "../../lib/api.ts";
import { keys, useEndpoints, useIntegrations, useRules, useSaveRule } from "../../lib/queries.ts";
import { getRouteApi } from "@tanstack/react-router";

const rulesRoute = getRouteApi("/app/rules");
import { PipelineStrip } from "./pipeline-strip.tsx";
import { RuleEditor } from "./rule-editor.tsx";
import { RuleList, RuleListSkeleton } from "./rule-list.tsx";
import { type Draft, RULE_TEMPLATES, emptyDraft, toDraft } from "./rule-utils.ts";

export function RulesPage() {
  const search = rulesRoute.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rules, isPending } = useRules();
  const { data: integrations = [] } = useIntegrations();
  const { data: endpoints = [] } = useEndpoints();
  const saveRule = useSaveRule();

  const [draft, setDraft] = useState<{ key: number; value: Draft } | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [testSignal, setTestSignal] = useState(0);

  const ordered = useMemo(
    () => [...(rules ?? [])].sort((a, b) => a.position - b.position),
    [rules],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ordered.filter((r) => r.name.toLowerCase().includes(q)) : ordered;
  }, [ordered, query]);

  const selected: Rule | null = draft
    ? null
    : (ordered.find((r) => r.id === search.rule) ?? ordered[0] ?? null);
  const active = ordered.filter((r) => r.enabled).length;
  const paused = ordered.length - active;

  const select = (id: string | undefined) => {
    setDraft(null);
    void navigate({ to: "/rules", search: id ? { rule: id } : {}, replace: true });
  };

  const startDraft = (value: Draft = emptyDraft()) => setDraft({ key: Date.now(), value });

  const setCache = (updater: (list: Rule[]) => Rule[]) =>
    qc.setQueryData<Rule[]>(keys.rules, (list) => (list ? updater(list) : list));

  const reorder = async (ids: string[]) => {
    const previous = qc.getQueryData<Rule[]>(keys.rules);
    setCache((list) => list.map((r) => ({ ...r, position: ids.indexOf(r.id) + 1 })));
    try {
      await api.reorderRules(ids);
    } catch {
      qc.setQueryData(keys.rules, previous);
      toast.danger("Couldn't reorder rules");
    }
  };

  const toggle = async (rule: Rule, enabled: boolean) => {
    setCache((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    try {
      const saved = await api.updateRule(rule.id, { enabled });
      setCache((list) => list.map((r) => (r.id === saved.id ? saved : r)));
      void qc.invalidateQueries({ queryKey: keys.pipeline });
    } catch {
      setCache((list) => list.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      toast.danger(`Couldn't ${enabled ? "enable" : "pause"} “${rule.name}”`);
    }
  };

  const duplicate = async (rule: Rule) => {
    try {
      const copy = await saveRule.mutateAsync({
        input: { ...toDraft(rule), name: `${rule.name} copy`, enabled: false },
      });
      toast.success(`Duplicated as “${copy.name}” (paused)`);
      select(copy.id);
    } catch {
      /* surfaced by the mutation's error toast */
    }
  };

  const remove = async (rule: Rule) => {
    try {
      await api.deleteRule(rule.id);
      const index = ordered.findIndex((r) => r.id === rule.id);
      setCache((list) => list.filter((r) => r.id !== rule.id));
      void qc.invalidateQueries({ queryKey: keys.pipeline });
      const next = ordered[index + 1] ?? ordered[index - 1];
      select(next && next.id !== rule.id ? next.id : undefined);
      toast(`Deleted “${rule.name}”`);
    } catch {
      toast.danger("Couldn't delete the rule");
    }
  };

  const empty = !isPending && ordered.length === 0 && !draft;
  const editorKey = draft
    ? `draft-${draft.key}`
    : selected
      ? `${selected.id}-${selected.updatedAt}`
      : "none";

  return (
    <>
      <Topbar
        left={
          <>
            <PageTitle>Rules</PageTitle>
            {rules && rules.length > 0 && (
              <span className="rounded-lg bg-default px-2 py-0.5 text-xs font-medium text-foreground">
                {active} active{paused ? ` · ${paused} paused` : ""}
              </span>
            )}
          </>
        }
        right={
          <>
            {searching ? (
              <SearchField
                aria-label="Filter rules"
                value={query}
                onChange={setQuery}
                onClear={() => setSearching(false)}
                onKeyDown={(e) => e.key === "Escape" && !query && setSearching(false)}
                autoFocus
                className="w-56"
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Filter rules…" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            ) : (
              <Tooltip delay={400}>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label="Filter rules"
                  onPress={() => setSearching(true)}
                  className="text-muted"
                >
                  <Search className="size-4" />
                </Button>
                <Tooltip.Content>Filter rules</Tooltip.Content>
              </Tooltip>
            )}
            <Button
              variant="outline"
              isDisabled={!selected && !draft}
              onPress={() => setTestSignal((n) => n + 1)}
            >
              <Play className="size-4" />
              Test with last request
            </Button>
            <Button onPress={() => startDraft()}>
              <Plus className="size-4" />
              New rule
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] px-6 py-5">
        <PipelineStrip />

        {empty ? (
          <EmptyRules onTemplate={(d) => startDraft(d)} integrations={integrations} />
        ) : (
          <div className="flex min-h-0 flex-1 gap-[18px]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-0.5 pr-0.5">
              {isPending ? (
                <RuleListSkeleton />
              ) : (
                <>
                  {query && visible.length === 0 && (
                    <p className="px-1 py-6 text-center text-sm text-muted">
                      No rules match “{query}”.
                    </p>
                  )}
                  <RuleList
                    rules={visible}
                    integrations={integrations}
                    selectedId={selected?.id ?? null}
                    onSelect={select}
                    onReorder={reorder}
                    onToggle={toggle}
                    onDuplicate={duplicate}
                    onDelete={remove}
                    onAdd={() => startDraft()}
                    reorderable={!query.trim()}
                  />
                </>
              )}
            </div>
            {(selected || draft) && (
              <RuleEditor
                key={editorKey}
                rule={selected}
                initial={draft ? draft.value : toDraft(selected!)}
                integrations={integrations}
                endpoints={endpoints}
                testSignal={testSignal}
                onSaved={(rule) => {
                  if (draft) select(rule.id);
                  else toast.success("Rule applied");
                }}
                onDiscardNew={() => setDraft(null)}
                onDuplicate={duplicate}
                onDelete={remove}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function EmptyRules({
  onTemplate,
  integrations,
}: {
  onTemplate: (draft: Draft) => void;
  integrations: Integration[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <SlidersHorizontal className="size-5" />
      </span>
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold">Decide what happens to every request</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Rules run top to bottom on each incoming request. Match on method, path, headers or body,
          reshape it with a JSONata transform, then respond, forward to an integration, replay or
          archive it.
        </p>
      </div>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 md:grid-cols-3">
        {RULE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTemplate(t.build(integrations))}
            className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 text-left outline-none transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="text-[13.5px] font-semibold text-foreground">{t.title}</span>
            <span className="text-xs leading-relaxed text-tertiary">{t.description}</span>
          </button>
        ))}
      </div>
      <Button variant="outline" onPress={() => onTemplate(emptyDraft())}>
        <Plus className="size-4" />
        Start from scratch
      </Button>
    </div>
  );
}
