import type { IntegrationKind } from "@inb/shared";

/** What a matched rule hands to the delivery queue. */
export interface OutboundRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface DeliveryContext {
  requestId: string;
  endpointId: string;
  endpointName: string;
  endpointSlug: string;
  status: number;
  summary: string;
  receivedAt: string;
}

export type DeliveryJob =
  | {
      type: "integration";
      integrationId: string;
      kind: IntegrationKind;
      ruleId: string | null;
      context: DeliveryContext;
      payload: OutboundRequest;
    }
  | {
      type: "replay";
      url: string;
      ruleId: string | null;
      context: DeliveryContext;
      payload: OutboundRequest;
    };
