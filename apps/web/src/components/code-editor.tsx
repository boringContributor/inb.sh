import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { useMemo } from "react";
import { cn } from "../lib/cn.ts";

/** Same palette as <CodeView>, so read-only and editable code look alike. */
const palette = HighlightStyle.define([
  { tag: t.propertyName, color: "#7dd3fc" },
  { tag: [t.string, t.special(t.string)], color: "#6ee7b7" },
  { tag: t.number, color: "#fcd34d" },
  { tag: [t.bool, t.null, t.keyword, t.operatorKeyword], color: "#f0abfc" },
  { tag: [t.function(t.variableName), t.variableName], color: "#c4b5fd" },
  { tag: [t.punctuation, t.bracket, t.separator, t.operator], color: "#71717a" },
  { tag: t.comment, color: "#71717a", fontStyle: "italic" },
]);

const theme = EditorView.theme(
  {
    "&": { color: "#fcfcfc", backgroundColor: "transparent" },
    ".cm-content": { caretColor: "#0485f7", padding: "12px 0" },
    ".cm-gutterElement": {
      padding: "0 12px 0 8px !important",
      minWidth: "40px",
      textAlign: "right",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(4,133,247,0.28) !important",
    },
    ".cm-placeholder": { color: "#71717a" },
    ".cm-template-token, .cm-template-token *": { color: "#c4b5fd !important" },
  },
  { dark: true },
);

/** `{{ … }}` template tokens stand out on top of the JSON grammar. */
const templateMatcher = new MatchDecorator({
  regexp: /\{\{[^}]*\}\}/g,
  decoration: Decoration.mark({ class: "cm-template-token" }),
});

const templateTokens = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = templateMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = templateMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

export function CodeEditor({
  value,
  onChange,
  language = "json",
  readOnly,
  minHeight,
  maxHeight,
  lineNumbers = true,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange?: (value: string) => void;
  /** JSONata borrows the JSON grammar; its object literals highlight well enough */
  language?: "json" | "jsonata" | "text";
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  lineNumbers?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const extensions = useMemo<Extension[]>(() => {
    const ext: Extension[] = [
      theme,
      syntaxHighlighting(palette),
      EditorView.lineWrapping,
      templateTokens,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ];
    if (language !== "text") ext.push(json());
    return ext;
  }, [language, ariaLabel]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      theme="none"
      placeholder={placeholder}
      minHeight={minHeight}
      maxHeight={maxHeight}
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        searchKeymap: true,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
      extensions={extensions}
      className={cn("font-mono text-xs", className)}
    />
  );
}
