import { type RequestContext, resolvePath } from "./context.ts";

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

export interface TemplateVariable {
  token: string;
  description: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { token: "{{ request.id }}", description: "Unique id of the incoming request" },
  { token: "{{ request.body.* }}", description: "Any path in the parsed JSON body" },
  { token: "{{ request.headers.* }}", description: "Header lookup, case-insensitive" },
  { token: "{{ now.iso8601 }}", description: "Server time when the reply is sent" },
];

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * Interpolate `{{ path }}` tokens. When `jsonAware` is set and a token is the
 * entire JSON string literal (`"{{ request.body }}"`), objects are inlined
 * as JSON instead of being double-encoded.
 */
export function renderTemplate(template: string, ctx: RequestContext, jsonAware = false): string {
  if (jsonAware) {
    template = template.replace(/"\{\{\s*([^}]+?)\s*\}\}"/g, (whole, path: string) => {
      const value = resolvePath(ctx, path);
      if (value !== null && typeof value === "object") return JSON.stringify(value);
      return whole;
    });
  }
  return template.replace(TOKEN, (_, path: string) => {
    const value = resolvePath(ctx, path);
    const text = stringify(value);
    return jsonAware ? JSON.stringify(text).slice(1, -1) : text;
  });
}

export function templateTokens(template: string): string[] {
  return [...template.matchAll(TOKEN)].map((m) => m[1]!);
}
