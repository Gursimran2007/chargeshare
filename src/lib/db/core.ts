import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool, PoolClient } from "pg";

/**
 * Minimal database interface shared by the embedded (PGlite) and networked
 * (node-postgres / Supabase) adapters. Everything uses $1-style parameters.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  kind: "pglite" | "postgres";
  /** Run fn in a transaction with the trusted server role. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run fn in a transaction as an end user, so Row Level Security applies. */
  asUser<T>(userId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Run a multi-statement SQL script atomically (migrations). */
  execScript(sql: string): Promise<void>;
  close(): Promise<void>;
}

async function impersonate(q: Queryable, userId: string | null) {
  const claims = JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" });
  await q.query("select set_config('request.jwt.claims', $1, true)", [claims]);
  await q.query(`set local role ${userId ? "authenticated" : "anon"}`);
}

/** PGlite does not serialise JS arrays; send them as Postgres array literals (node-postgres does this itself). */
function pgArrayParams(params?: unknown[]) {
  return params?.map((p) =>
    Array.isArray(p)
      ? "{" + p.map((v) => (v === null ? "NULL" : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",") + "}"
      : p,
  );
}

export function wrapPglite(pg: PGlite): Db {
  return {
    kind: "pglite",
    query: (text, params) => pg.query(text, pgArrayParams(params)) as never,
    tx: (fn) => pg.transaction((t) => fn({ query: (text, params) => t.query(text, pgArrayParams(params)) as never })),
    asUser: (userId, fn) =>
      pg.transaction(async (t) => {
        const q: Queryable = { query: (text, params) => t.query(text, pgArrayParams(params)) as never };
        await impersonate(q, userId);
        return fn(q);
      }),
    execScript: async (sql) => {
      await pg.transaction(async (t) => {
        await t.exec(sql);
      });
    },
    close: () => pg.close(),
  };
}

export function wrapPool(pool: Pool): Db {
  async function inTx<T>(fn: (c: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  return {
    kind: "postgres",
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    tx: (fn) => inTx((c) => fn({ query: (text, params) => c.query(text, params as unknown[]) as never })),
    asUser: (userId, fn) =>
      inTx(async (c) => {
        const q: Queryable = { query: (text, params) => c.query(text, params as unknown[]) as never };
        await impersonate(q, userId);
        return fn(q);
      }),
    execScript: async (sql) => {
      await inTx(async (c) => {
        await c.query(sql);
      });
    },
    close: () => pool.end(),
  };
}

export async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const pg = await PGlite.create({
    dataDir,
    extensions: { btree_gist },
    // Return numerics/bigints as JS numbers (amounts are integer paise).
    parsers: { 1700: (v: string) => Number(v), 20: (v: string) => Number(v) },
  });
  return wrapPglite(pg);
}

export async function createPool(connectionString: string): Promise<Db> {
  const pg = await import("pg");
  pg.default.types.setTypeParser(20, (v) => Number(v));
  pg.default.types.setTypeParser(1700, (v) => Number(v));
  const pool = new pg.default.Pool({ connectionString, max: 10 });
  return wrapPool(pool);
}

const root = process.cwd();

function sqlFiles(dir: string) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), "utf8") }));
}

/** Apply pending migrations. The local Supabase shim is applied only for PGlite. */
export async function migrate(db: Db, opts: { withShim: boolean }) {
  await db.query("create schema if not exists internal");
  await db.query(
    "create table if not exists internal.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ name: string }>("select name from internal.schema_migrations")).rows.map((r) => r.name),
  );
  const files = [
    ...(opts.withShim ? sqlFiles(path.join(root, "supabase/local")).map((f) => ({ ...f, name: `local/${f.name}` })) : []),
    ...sqlFiles(path.join(root, "supabase/migrations")),
  ];
  for (const f of files) {
    if (done.has(f.name)) continue;
    const name = f.name.replace(/'/g, "''");
    await db.execScript(`${f.sql}\n;insert into internal.schema_migrations (name) values ('${name}');`);
  }
}
