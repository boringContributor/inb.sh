import { useState } from "react";
import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  TextField,
  Tooltip,
  Description,
} from "@heroui/react";
import { Code, Plus, Trash, TriangleAlert } from "lucide-react";
import type { HeaderPair, ResponseConfig } from "@inb/shared";
import { STATUS_TEXT } from "@inb/shared";
import { CodeEditor } from "../../components/code-editor.tsx";
import { cn } from "../../lib/cn.ts";
import { COMMON_STATUSES, CONTENT_TYPES } from "./preview.ts";

const FIELD_LABEL = "text-xs font-medium text-muted";
const CONTROL = "h-9 rounded-xl border border-border bg-surface font-mono text-[13px]";

function StatusField({ status, onChange }: { status: number; onChange: (s: number) => void }) {
  const [custom, setCustom] = useState(() => !COMMON_STATUSES.includes(status));
  const showCustom = custom || !COMMON_STATUSES.includes(status);
  const selected = showCustom ? "custom" : String(status);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex gap-2">
        <Select
          className="min-w-0 flex-1"
          value={selected}
          onChange={(key) => {
            if (key === null) return;
            if (key === "custom") {
              setCustom(true);
            } else {
              setCustom(false);
              onChange(Number(key));
            }
          }}
        >
          <Label className={FIELD_LABEL}>Status code</Label>
          <Select.Trigger className={CONTROL}>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {COMMON_STATUSES.map((code) => (
                <ListBox.Item
                  key={code}
                  id={String(code)}
                  textValue={`${code} ${STATUS_TEXT[code] ?? ""}`}
                >
                  <span className="font-mono text-[13px]">
                    {code} {STATUS_TEXT[code]}
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
              <ListBox.Item id="custom" textValue="Custom">
                Custom…
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        {showCustom && (
          <NumberField
            aria-label="Custom status code"
            value={status}
            minValue={100}
            maxValue={599}
            formatOptions={{ useGrouping: false }}
            onChange={(v) => Number.isFinite(v) && onChange(Math.round(v))}
            className="mt-[22px] w-20"
          >
            <NumberField.Group className={CONTROL}>
              <NumberField.Input className="w-full bg-transparent px-3 font-mono text-[13px] outline-none" />
            </NumberField.Group>
          </NumberField>
        )}
      </div>
    </div>
  );
}

function ContentTypeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = CONTENT_TYPES.includes(value) ? CONTENT_TYPES : [value, ...CONTENT_TYPES];
  return (
    <Select
      className="min-w-0 flex-1"
      value={value}
      onChange={(key) => key !== null && onChange(String(key))}
    >
      <Label className={FIELD_LABEL}>Content-Type</Label>
      <Select.Trigger className={CONTROL}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((ct) => (
            <ListBox.Item key={ct} id={ct} textValue={ct}>
              <span className="font-mono text-[13px]">{ct}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function DelayField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <NumberField
      className="flex min-w-0 flex-1 flex-col gap-1.5"
      value={value}
      minValue={0}
      maxValue={30_000}
      step={50}
      formatOptions={{ useGrouping: false }}
      onChange={(v) => onChange(Number.isFinite(v) ? Math.round(v) : 0)}
    >
      <Label className={FIELD_LABEL}>Artificial delay</Label>
      <NumberField.Group className={cn(CONTROL, "flex items-center px-3")}>
        <NumberField.Input className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none" />
        <span className="font-mono text-[13px] text-tertiary">ms</span>
      </NumberField.Group>
    </NumberField>
  );
}

function HeadersEditor({
  headers,
  onChange,
  template,
}: {
  headers: HeaderPair[];
  onChange: (h: HeaderPair[]) => void;
  template: boolean;
}) {
  const update = (i: number, patch: Partial<HeaderPair>) =>
    onChange(headers.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center gap-2">
        <span className={cn(FIELD_LABEL, "flex-1")} id="response-headers-label">
          Response headers
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-[26px] gap-1.5 px-3 text-xs text-accent"
          isDisabled={headers.length >= 50}
          onPress={() => onChange([...headers, { key: "", value: "" }])}
        >
          <Plus className="size-[13px]" />
          Add header
        </Button>
      </div>
      <ul aria-labelledby="response-headers-label" className="flex flex-col gap-2">
        {headers.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-tertiary">
            No extra headers. <span className="font-mono">content-type</span> is always sent.
          </li>
        )}
        {headers.map((h, i) => {
          const hasToken = template && /\{\{[^}]*\}\}/.test(h.value);
          return (
            <li key={i} className="flex w-full items-center gap-2">
              <Input
                aria-label={`Header ${i + 1} name`}
                placeholder="x-header-name"
                value={h.key}
                onChange={(e) => update(i, { key: e.target.value.trim() })}
                className="h-8 w-[240px] max-w-[40%] rounded-lg border border-border bg-surface px-2.5 font-mono text-xs text-code-key"
              />
              <Input
                aria-label={`Header ${i + 1} value`}
                placeholder={template ? "{{ request.id }}" : "value"}
                value={h.value}
                onChange={(e) => update(i, { value: e.target.value })}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 font-mono text-xs",
                  hasToken ? "text-code-keyword" : "text-code-string",
                )}
              />
              <Tooltip delay={400}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove header ${h.key || i + 1}`}
                  className="size-7 min-w-7 text-muted hover:text-danger"
                  onPress={() => onChange(headers.filter((_, j) => j !== i))}
                >
                  <Trash className="size-3.5" />
                </Button>
                <Tooltip.Content>Remove header</Tooltip.Content>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function bodyLanguageLabel(ct: string) {
  if (/json/i.test(ct)) return "JSON";
  if (/html/i.test(ct)) return "HTML";
  if (/xml/i.test(ct)) return "XML";
  if (/x-www-form-urlencoded/i.test(ct)) return "FORM";
  return "TEXT";
}

export function DefinitionPanel({
  draft,
  onChange,
  bodyWarning,
}: {
  draft: ResponseConfig;
  onChange: (patch: Partial<ResponseConfig>) => void;
  bodyWarning: string | null;
}) {
  const proxy = draft.mode === "proxy";
  const template = draft.mode === "template";
  const proxyInvalid = proxy && !!draft.proxyUrl && !/^https?:\/\/[^\s]+$/i.test(draft.proxyUrl);

  return (
    <section
      aria-label="Response definition"
      className="flex min-h-[520px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <header className="flex h-[46px] w-full shrink-0 items-center gap-2 border-b border-separator px-4">
        <Code className="size-[15px] text-muted" aria-hidden />
        <h2 className="flex-1 text-[13px] font-semibold text-foreground">Response definition</h2>
        <Chip size="sm" className="bg-default text-xs font-medium text-foreground">
          applies to all methods
        </Chip>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {proxy ? (
          <div className="flex w-full gap-3 max-[900px]:flex-col">
            <TextField
              className="flex min-w-0 flex-[2] flex-col gap-1.5"
              value={draft.proxyUrl ?? ""}
              onChange={(v) => onChange({ proxyUrl: v.trim() })}
              isInvalid={proxyInvalid}
              type="url"
            >
              <Label className={FIELD_LABEL}>Upstream URL</Label>
              <Input
                placeholder="https://api.example.com/webhooks"
                className={cn(CONTROL, "px-3")}
              />
              <Description className="text-[11.5px] text-tertiary">
                {proxyInvalid
                  ? "Enter a full http(s) URL."
                  : "The request path and query are appended. Status, headers and body come from the upstream."}
              </Description>
            </TextField>
            <DelayField value={draft.delayMs} onChange={(delayMs) => onChange({ delayMs })} />
          </div>
        ) : (
          <div className="flex w-full gap-3 max-[900px]:flex-col">
            <StatusField status={draft.status} onChange={(status) => onChange({ status })} />
            <ContentTypeField
              value={draft.contentType}
              onChange={(contentType) => onChange({ contentType })}
            />
            <DelayField value={draft.delayMs} onChange={(delayMs) => onChange({ delayMs })} />
          </div>
        )}

        {proxy ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 text-[12.5px] leading-5 text-muted">
            <Code className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <p>
              In proxy mode only the upstream URL and delay are used. inb.sh forwards the request as
              received and relays the upstream's status, headers and body — a{" "}
              <span className="font-mono text-foreground">502</span> is returned if the upstream
              can't be reached within 25 s. Switch to Static or Template to define the reply
              yourself.
            </p>
          </div>
        ) : (
          <>
            <HeadersEditor
              headers={draft.headers}
              onChange={(headers) => onChange({ headers })}
              template={template}
            />

            <div className="flex min-h-[220px] w-full flex-1 flex-col gap-2">
              <div className="flex w-full items-center gap-2">
                <span className={cn(FIELD_LABEL, "flex-1")} id="response-body-label">
                  Response body
                </span>
                <Chip
                  size="sm"
                  className="bg-default font-mono text-[11px] font-medium text-foreground"
                >
                  {bodyLanguageLabel(draft.contentType)}
                </Chip>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
                <CodeEditor
                  ariaLabel="Response body"
                  value={draft.body}
                  onChange={(body) => onChange({ body })}
                  language={/json/i.test(draft.contentType) ? "json" : "text"}
                  minHeight="200px"
                  className="min-h-0 flex-1 overflow-auto"
                  placeholder={template ? '{ "id": "{{ request.id }}" }' : "Response body"}
                />
              </div>
              {bodyWarning && (
                <p role="status" className="flex items-center gap-1.5 text-[11.5px] text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  {bodyWarning}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
