import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Button, Tooltip, toast } from "@heroui/react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/cn.ts";

type TokenKind = "key" | "string" | "number" | "keyword" | "template" | "punct" | "plain";

const TOKEN_CLASS: Record<TokenKind, string> = {
  key: "text-code-key",
  string: "text-code-string",
  number: "text-code-number",
  keyword: "text-code-keyword",
  template: "text-code-template",
  punct: "text-code-punct",
  plain: "text-foreground",
};

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\{\{[^}]*\}\})|(\s+)|([^\s"{}[\],:]+)/g;

function tokenizeJsonLine(line: string): { kind: TokenKind; text: string }[] {
  const out: { kind: TokenKind; text: string }[] = [];
  for (const m of line.matchAll(JSON_TOKEN)) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push({ kind: "key", text: m[1] }, { kind: "punct", text: m[2] });
      } else if (/\{\{[^}]*\}\}/.test(m[1])) {
        // string containing template tokens: highlight the tokens inside
        const parts = m[1].split(/(\{\{[^}]*\}\})/);
        for (const p of parts) if (p) out.push({ kind: p.startsWith("{{") ? "template" : "string", text: p });
      } else out.push({ kind: "string", text: m[1] });
    } else if (m[3] !== undefined) out.push({ kind: "number", text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: "keyword", text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: "punct", text: m[5] });
    else if (m[6] !== undefined) out.push({ kind: "template", text: m[6] });
    else out.push({ kind: "plain", text: m[0] });
  }
  return out;
}

export function prettyJson(text: string): { text: string; isJson: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}

/**
 * Read-only code view with line numbers and the design's JSON palette.
 * Non-JSON text renders plain; `wrap` toggles soft wrapping.
 */
export function CodeView({
  code,
  language = "json",
  lineNumbers = true,
  wrap = false,
  highlight,
  className,
}: {
  code: string;
  language?: "json" | "text" | "http" | "shell";
  lineNumbers?: boolean;
  wrap?: boolean;
  /** case-insensitive substring to mark */
  highlight?: string;
  className?: string;
}) {
  const lines = useMemo(() => code.split("\n"), [code]);
  const mark = (text: string): ReactNode => {
    if (!highlight) return text;
    const i = text.toLowerCase().indexOf(highlight.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="rounded-sm bg-warning/30 text-inherit">{text.slice(i, i + highlight.length)}</mark>
        {mark(text.slice(i + highlight.length))}
      </>
    );
  };
  return (
    <div className={cn("overflow-auto py-3 font-mono text-xs leading-5", className)}>
      <table className="border-separate border-spacing-0">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              {lineNumbers && (
                <td className="w-10 select-none pr-3.5 text-right align-top text-[11px] text-tertiary tabular-nums">{i + 1}</td>
              )}
              <td className={cn("pr-4 align-top", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre", !lineNumbers && "pl-3.5")}>
                {language === "json"
                  ? tokenizeJsonLine(line).map((t, j) => (
                      <span key={j} className={TOKEN_CLASS[t.kind]}>
                        {mark(t.text)}
                      </span>
                    ))
                  : language === "http" || language === "shell"
                    ? highlightShellish(line, mark)
                    : <span className="text-foreground">{mark(line)}</span>}
                {line === "" && "\u200b"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function highlightShellish(line: string, mark: (t: string) => ReactNode): ReactNode {
  // header lines `key: value`, curl flags, quoted strings
  const header = line.match(/^(\s*)([A-Za-z0-9-]+)(:\s)(.*)$/);
  if (header) {
    return (
      <>
        {header[1]}
        <span className="text-code-key">{mark(header[2]!)}</span>
        <span className="text-code-punct">{header[3]}</span>
        <span className="text-foreground">{mark(header[4]!)}</span>
      </>
    );
  }
  const parts = line.split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\s-{1,2}[A-Za-z-]+|^curl|\\$)/);
  return parts.map((p, i) => {
    if (!p) return <Fragment key={i} />;
    const cls =
      p === "curl"
        ? "text-code-number"
        : /^\s-{1,2}/.test(p)
          ? "text-code-punct"
          : /^['"]/.test(p)
            ? "text-code-string"
            : p === "\\"
              ? "text-code-punct"
              : "text-foreground";
    return (
      <span key={i} className={cls}>
        {mark(p)}
      </span>
    );
  });
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string, message = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast(message, { timeout: 1800 });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.danger("Clipboard is not available");
    }
  };
  return { copied, copy };
}

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  className,
}: {
  text: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { copied, copy } = useCopy();
  const Icon = copied ? Check : Copy;
  return (
    <Tooltip delay={400}>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={label}
        onPress={() => copy(text)}
        className={cn(size === "sm" ? "size-7 min-w-7" : "size-9 min-w-9", "text-muted", className)}
      >
        <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
