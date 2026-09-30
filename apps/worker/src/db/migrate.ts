/**
 * Forward-only migrations, applied lazily on the first request an isolate
 * serves. Keeping them in code means a fresh `sst deploy` is all a
 * self-hoster needs — no separate migration step against D1.
 *
 * Keep in sync with `schema.ts`. Never edit a shipped migration; append.
 */
const MIGRATIONS: { id: number; sql: string[] }[] = [
  {
    id: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'webhook',
        retention_days INTEGER NOT NULL DEFAULT 7,
        response TEXT NOT NULL,
        signing TEXT,
        request_count INTEGER NOT NULL DEFAULT 0,
        last_request_at INTEGER,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS endpoints_created_idx ON endpoints (created_at)`,
      `CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        endpoint_id TEXT,
        conditions TEXT NOT NULL,
        transform TEXT,
        actions TEXT NOT NULL,
        runs INTEGER NOT NULL DEFAULT 0,
        ok INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        blocked INTEGER NOT NULL DEFAULT 0,
        last_run_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS rules_position_idx ON rules (position)`,
      `CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        rule_id TEXT,
        status INTEGER,
        ok INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER,
        error TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS deliveries_integration_idx ON deliveries (integration_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS deliveries_created_idx ON deliveries (created_at)`,
      `CREATE TABLE IF NOT EXISTS archived_requests (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        data TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER NOT NULL,
        summary TEXT NOT NULL,
        size INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        archived_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS archived_at_idx ON archived_requests (archived_at)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    ],
  },
];

let applied: Promise<void> | null = null;

export function ensureMigrated(db: D1Database): Promise<void> {
  applied ??= run(db).catch((err) => {
    applied = null;
    throw err;
  });
  return applied;
}

async function run(db: D1Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const { results } = await db.prepare(`SELECT id FROM _migrations`).all<{ id: number }>();
  const done = new Set(results.map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await db.batch([
      ...migration.sql.map((sql) => db.prepare(sql)),
      db.prepare(`INSERT OR IGNORE INTO _migrations (id, applied_at) VALUES (?, ?)`).bind(migration.id, Date.now()),
    ]);
  }
}
