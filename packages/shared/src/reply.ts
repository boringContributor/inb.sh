import type { RequestContext } from "./context.ts";
import { renderTemplate } from "./template.ts";
import type { ResponseConfig } from "./types.ts";

export interface RenderedReply {
  status: number;
  headers: [string, string][];
  body: string;
}

/** What Inbound answers when no custom response or rule applies. */
export function defaultReply(requestId: string): RenderedReply {
  return {
    status: 200,
    headers: [["content-type", "application/json"]],
    body: JSON.stringify({ received: true, id: requestId }),
  };
}

/**
 * Static / template custom responses. Shared by the worker and the
 * dashboard's live preview so the preview is exactly what senders get.
 * Proxy mode is handled by the worker (it needs the network).
 */
export function renderConfiguredReply(cfg: ResponseConfig, ctx: RequestContext): RenderedReply {
  const template = cfg.mode === "template";
  const json = /json/i.test(cfg.contentType);
  return {
    status: cfg.status,
    headers: [
      ["content-type", cfg.contentType],
      ...cfg.headers
        .filter((h) => h.key.trim())
        .map(
          ({ key, value }) =>
            [key, template ? renderTemplate(value, ctx) : value] as [string, string],
        ),
    ],
    body: template ? renderTemplate(cfg.body, ctx, json) : cfg.body,
  };
}
