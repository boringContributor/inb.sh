import { eq, sql } from "drizzle-orm";
import type { RequestEvent } from "@inb/shared";
import type { BatchItem } from "drizzle-orm/batch";
import type { Env } from "../env.ts";
import { getDb, schema } from "../db/repo.ts";
import { deliveryId } from "../lib/ids.ts";
import type { DeliveryJob } from "./job.ts";
import { forward, send, type SendResult } from "./send.ts";

const MAX_ATTEMPTS = 5;

/** Exponential backoff: 10s, 40s, 160s, 640s. */
const backoff = (attempt: number) => Math.min(900, 10 * 4 ** (attempt - 1));

export async function consumeDeliveries(batch: MessageBatch<DeliveryJob>, env: Env) {
  const db = await getDb(env.Database);
  const integrations = new Map(
    (await db.query.integrations.findMany()).map((i) => [i.id, i] as const),
  );

  await Promise.all(
    batch.messages.map(async (message) => {
      const job = message.body;
      let result: SendResult;
      let label: string;
      if (job.type === "integration") {
        const integration = integrations.get(job.integrationId);
        if (!integration || !integration.enabled) {
          message.ack();
          return;
        }
        label = integration.name;
        result = await send(
          integration.kind,
          integration.config,
          job.context,
          job.payload,
          env.Archive,
        );
      } else {
        label = new URL(job.url).host;
        result = await forward(job.url, job.payload);
      }

      const final = result.ok || !result.retryable || message.attempts >= MAX_ATTEMPTS;
      if (!final) {
        message.retry({ delaySeconds: backoff(message.attempts) });
        return;
      }

      const now = new Date();
      const writes: BatchItem<"sqlite">[] = [];
      if (job.type === "integration") {
        writes.push(
          db.insert(schema.deliveries).values({
            id: deliveryId(),
            integrationId: job.integrationId,
            requestId: job.context.requestId,
            endpointId: job.context.endpointId,
            ruleId: job.ruleId,
            status: result.status,
            ok: result.ok,
            attempts: message.attempts,
            durationMs: result.durationMs,
            error: result.error,
            createdAt: now,
          }),
        );
      }
      if (job.ruleId) {
        writes.push(
          db
            .update(schema.rules)
            .set(
              result.ok
                ? { ok: sql`${schema.rules.ok} + 1` }
                : { failed: sql`${schema.rules.failed} + 1` },
            )
            .where(eq(schema.rules.id, job.ruleId)),
        );
      }
      const [head, ...tail] = writes;
      if (head) await db.batch([head, ...tail]);

      const event: RequestEvent = result.ok
        ? {
            type: job.type === "replay" ? "replayed" : "delivered",
            at: now.toISOString(),
            label: job.type === "replay" ? "Replayed" : "Delivered",
            detail: `${label} · ${result.status}${message.attempts > 1 ? ` · ${message.attempts} attempts` : ""}`,
          }
        : {
            type: "delivery_failed",
            at: now.toISOString(),
            label: "Delivery failed",
            detail: `${label} · ${result.error ?? result.status}`,
          };
      const hub = env.Hub.get(env.Hub.idFromName(job.context.endpointId));
      await hub.addEvents(job.context.requestId, [event]);
      message.ack();
    }),
  );
}
