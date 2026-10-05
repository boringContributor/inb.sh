import { DurableObject } from "cloudflare:workers";
import type {
  CapturedRequest,
  LiveMessage,
  RequestEvent,
  RequestFilter,
  RequestPage,
  RequestSummary,
} from "@inb/shared";
import type { Env } from "./env.ts";

export type StoredRequest = Omit<CapturedRequest, "events">;

type Row = {
  id: string;
  endpoint_id: string;
  method: string;
  path: string;
  status: number;
  size: number;
  content_type: string | null;
  summary: string;
  received_at: number;
  replay_count: number;
  attempt?: number | null;
  data: string;
};

const SUMMARY_COLUMNS = `id, endpoint_id, method, path, status, size, content_type, summary, received_at, replay_count`;
const LIST_COLUMNS = `${SUMMARY_COLUMNS}, json_extract(data, '$.attempt') AS attempt`;
const HOUR = 3_600_000;
/** An identical delivery within this long of the previous one counts as a retry. */
const ATTEMPT_TTL = 24 * HOUR;

/**
 * One instance per endpoint. Owns the endpoint's request history in its own
 * SQLite database and fans live updates out to dashboards (role `ui`) and
 * CLI tunnels (role `tunnel`) over hibernatable WebSockets.
 */
export class EndpointHub extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    void ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER NOT NULL,
        size INTEGER NOT NULL,
        content_type TEXT,
        summary TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        replay_count INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL
      )`);
      this.sql.exec(
        `CREATE INDEX IF NOT EXISTS requests_received_idx ON requests (received_at DESC, id DESC)`,
      );
      this.sql.exec(`CREATE TABLE IF NOT EXISTS events (
        request_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        detail TEXT NOT NULL
      )`);
      this.sql.exec(`CREATE INDEX IF NOT EXISTS events_request_idx ON events (request_id, at)`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS attempts (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        last_at INTEGER NOT NULL
      )`);
    });
  }

  /* ------------------------------- writes -------------------------------- */

  async ingest(request: StoredRequest, events: RequestEvent[]): Promise<void> {
    this.sql.exec(
      `INSERT OR REPLACE INTO requests (${SUMMARY_COLUMNS}, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      request.id,
      request.endpointId,
      request.method,
      request.path,
      request.status,
      request.size,
      request.contentType,
      request.summary,
      Date.parse(request.receivedAt),
      request.replayCount,
      JSON.stringify(request),
    );
    for (const e of events) this.insertEvent(request.id, e);
    this.broadcast({ type: "request", request: toSummary(request) });
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(Date.now() + HOUR);
  }

  async addEvents(requestId: string, events: RequestEvent[]): Promise<void> {
    for (const e of events) {
      this.insertEvent(requestId, e);
      this.broadcast({ type: "event", requestId, event: e });
    }
  }

  async markReplayed(requestId: string, event: RequestEvent): Promise<RequestSummary | null> {
    this.sql.exec(`UPDATE requests SET replay_count = replay_count + 1 WHERE id = ?`, requestId);
    const row = this.sql.exec<Row>(`SELECT * FROM requests WHERE id = ?`, requestId).toArray()[0];
    if (!row) return null;
    const stored = JSON.parse(row.data) as StoredRequest;
    stored.replayCount = row.replay_count;
    this.sql.exec(`UPDATE requests SET data = ? WHERE id = ?`, JSON.stringify(stored), requestId);
    this.insertEvent(requestId, event);
    const summary = toSummary(stored);
    this.broadcast({ type: "request_updated", request: summary });
    this.broadcast({ type: "event", requestId, event });
    return summary;
  }

  /** Count one delivery attempt for `key` and return its number (1 = first try). */
  async countAttempt(key: string): Promise<number> {
    const now = Date.now();
    this.sql.exec(`DELETE FROM attempts WHERE key = ? AND last_at < ?`, key, now - ATTEMPT_TTL);
    return this.sql
      .exec<{ count: number }>(
        `INSERT INTO attempts (key, count, last_at) VALUES (?, 1, ?)
         ON CONFLICT (key) DO UPDATE SET count = count + 1, last_at = excluded.last_at
         RETURNING count`,
        key,
        now,
      )
      .one().count;
  }

  /** The delivery was acknowledged: the next identical one starts at attempt 1 again. */
  async settleAttempt(key: string): Promise<void> {
    this.sql.exec(`DELETE FROM attempts WHERE key = ?`, key);
  }

  async clear(): Promise<void> {
    this.sql.exec(`DELETE FROM requests`);
    this.sql.exec(`DELETE FROM events`);
    this.sql.exec(`DELETE FROM attempts`);
    this.broadcast({ type: "cleared" });
  }

  /** Endpoint deleted or expired: drop every byte and disconnect listeners. */
  async destroy(): Promise<void> {
    this.broadcast({ type: "cleared" });
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "endpoint deleted");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async setRetention(days: number): Promise<void> {
    await this.ctx.storage.put("retentionDays", days);
  }

  /** Hand a request to connected CLI tunnels; returns how many received it. */
  async tunnel(payload: { request: CapturedRequest; url: string }): Promise<number> {
    const sockets = this.ctx.getWebSockets("tunnel");
    const msg = JSON.stringify({ type: "forward", ...payload });
    for (const ws of sockets) ws.send(msg);
    return sockets.length;
  }

  /* -------------------------------- reads -------------------------------- */

  async list(opts: {
    filter: RequestFilter;
    q?: string;
    cursor?: string | null;
    limit: number;
    order: "asc" | "desc";
  }): Promise<RequestPage> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    switch (opts.filter) {
      case "2xx":
        where.push(`status BETWEEN 200 AND 299`);
        break;
      case "4xx":
        where.push(`status BETWEEN 400 AND 499`);
        break;
      case "5xx":
        where.push(`status >= 500`);
        break;
      case "replayed":
        where.push(`replay_count > 0`);
        break;
    }
    if (opts.q?.trim()) {
      const like = `%${opts.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
      where.push(
        `(summary LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR method LIKE ? ESCAPE '\\' OR id = ? OR data LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like, opts.q.trim(), like);
    }
    const filterWhere = [...where];
    const filterParams = [...params];
    if (opts.cursor) {
      const [ts, id] = opts.cursor.split(":");
      const cmp = opts.order === "desc" ? "<" : ">";
      where.push(`(received_at ${cmp} ? OR (received_at = ? AND id ${cmp} ?))`);
      params.push(Number(ts), Number(ts), id ?? "");
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const dir = opts.order === "desc" ? "DESC" : "ASC";
    const rows = this.sql
      .exec<Row>(
        `SELECT ${LIST_COLUMNS} FROM requests ${clause} ORDER BY received_at ${dir}, id ${dir} LIMIT ?`,
        ...params,
        opts.limit + 1,
      )
      .toArray();
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(rowToSummary);
    const last = rows[opts.limit - 1];

    const filterClause = filterWhere.length ? `WHERE ${filterWhere.join(" AND ")}` : "";
    const total = this.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM requests ${filterClause}`, ...filterParams)
      .one().n;
    const c = this.sql
      .exec<Record<string, number>>(
        `SELECT COUNT(*) AS all_count,
          COALESCE(SUM(status BETWEEN 200 AND 299), 0) AS s2,
          COALESCE(SUM(status BETWEEN 400 AND 499), 0) AS s4,
          COALESCE(SUM(status >= 500), 0) AS s5,
          COALESCE(SUM(replay_count > 0), 0) AS rp
        FROM requests`,
      )
      .one();
    return {
      items,
      total,
      counts: { all: c.all_count!, "2xx": c.s2!, "4xx": c.s4!, "5xx": c.s5!, replayed: c.rp! },
      nextCursor: hasMore && last ? `${last.received_at}:${last.id}` : null,
    };
  }

  async get(id: string): Promise<CapturedRequest | null> {
    const row = this.sql.exec<Row>(`SELECT * FROM requests WHERE id = ?`, id).toArray()[0];
    if (!row) return null;
    return this.hydrate(row);
  }

  async latest(): Promise<CapturedRequest | null> {
    const row = this.sql
      .exec<Row>(`SELECT * FROM requests ORDER BY received_at DESC LIMIT 1`)
      .toArray()[0];
    return row ? this.hydrate(row) : null;
  }

  async stats(): Promise<{
    total: number;
    today: number;
    avgResponseMs: number | null;
    listeners: number;
  }> {
    const since = Date.now() - 24 * HOUR;
    const r = this.sql
      .exec<{ total: number; today: number }>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(received_at >= ?), 0) AS today FROM requests`,
        since,
      )
      .one();
    const avg = this.sql
      .exec<{ avg: number | null }>(
        `SELECT AVG(json_extract(data, '$.response.durationMs')) AS avg FROM (SELECT data FROM requests ORDER BY received_at DESC LIMIT 200)`,
      )
      .one().avg;
    return {
      total: r.total,
      today: r.today,
      avgResponseMs: avg === null ? null : Math.round(avg),
      listeners: this.ctx.getWebSockets("ui").length,
    };
  }

  /* ------------------------------ realtime ------------------------------- */

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const role = new URL(request.url).searchParams.get("role") === "tunnel" ? "tunnel" : "ui";
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [role]);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    pair[1].send(
      JSON.stringify({
        type: "hello",
        listeners: this.ctx.getWebSockets(role).length,
      } satisfies LiveMessage),
    );
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // tunnels report the local result of a forwarded request
    if (typeof message !== "string") return;
    try {
      const msg = JSON.parse(message) as {
        type?: string;
        requestId?: string;
        status?: number;
        durationMs?: number;
        url?: string;
        error?: string;
      };
      if (msg.type === "forward_result" && msg.requestId) {
        const ok = !msg.error && (msg.status ?? 0) < 500;
        await this.addEvents(msg.requestId, [
          {
            type: ok ? "delivered" : "delivery_failed",
            at: new Date().toISOString(),
            label: ok ? `Tunneled ${msg.status}` : "Tunnel failed",
            detail: msg.error ?? `${msg.url ?? "localhost"} · ${msg.durationMs ?? 0} ms`,
          },
        ]);
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "invalid message" }));
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code === 1005 ? 1000 : code, "closing");
  }

  override async alarm(): Promise<void> {
    const days = (await this.ctx.storage.get<number>("retentionDays")) ?? 7;
    const cutoff = Date.now() - days * 24 * HOUR;
    const expired = this.sql
      .exec<{ id: string }>(`SELECT id FROM requests WHERE received_at < ?`, cutoff)
      .toArray();
    if (expired.length) {
      this.sql.exec(
        `DELETE FROM events WHERE request_id IN (SELECT id FROM requests WHERE received_at < ?)`,
        cutoff,
      );
      this.sql.exec(`DELETE FROM requests WHERE received_at < ?`, cutoff);
    }
    this.sql.exec(`DELETE FROM attempts WHERE last_at < ?`, Date.now() - ATTEMPT_TTL);
    const remaining = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM requests`).one().n;
    if (remaining > 0) await this.ctx.storage.setAlarm(Date.now() + HOUR);
  }

  /* ------------------------------- helpers ------------------------------- */

  private insertEvent(requestId: string, e: RequestEvent) {
    this.sql.exec(
      `INSERT INTO events (request_id, at, type, label, detail) VALUES (?, ?, ?, ?, ?)`,
      requestId,
      Date.parse(e.at),
      e.type,
      e.label,
      e.detail,
    );
  }

  private hydrate(row: Row): CapturedRequest {
    const stored = JSON.parse(row.data) as StoredRequest;
    const events = this.sql
      .exec<{ at: number; type: RequestEvent["type"]; label: string; detail: string }>(
        `SELECT at, type, label, detail FROM events WHERE request_id = ? ORDER BY at ASC, rowid ASC`,
        row.id,
      )
      .toArray()
      .map((e) => ({ ...e, at: new Date(e.at).toISOString() }));
    return { ...stored, replayCount: row.replay_count, events };
  }

  private broadcast(msg: LiveMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets("ui")) {
      try {
        ws.send(data);
      } catch {
        /* socket already closing */
      }
    }
  }
}

function rowToSummary(row: Omit<Row, "data">): RequestSummary {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    method: row.method,
    path: row.path,
    status: row.status,
    size: row.size,
    contentType: row.content_type,
    summary: row.summary,
    receivedAt: new Date(row.received_at).toISOString(),
    replayCount: row.replay_count,
    ...(row.attempt != null && { attempt: row.attempt }),
  };
}

export function toSummary(r: StoredRequest): RequestSummary {
  return {
    id: r.id,
    endpointId: r.endpointId,
    method: r.method,
    path: r.path,
    status: r.status,
    size: r.size,
    contentType: r.contentType,
    summary: r.summary,
    receivedAt: r.receivedAt,
    replayCount: r.replayCount,
    ...(r.attempt !== undefined && { attempt: r.attempt }),
  };
}
