import "server-only";
import fs from "node:fs";
import path from "node:path";
import { assertConfig, config } from "@/lib/config";
import { createPglite, createPool, migrate, type Db } from "./core";
import { seedDemoData } from "@/lib/seed";

export type { Db, Queryable } from "./core";

const g = globalThis as unknown as { __chargeshareDb?: Promise<Db> };

async function init(): Promise<Db> {
  assertConfig();
  if (config.databaseUrl) {
    // Networked Postgres (Supabase). Migrations are applied by `npm run db:migrate`.
    return createPool(config.databaseUrl);
  }
  // Runtime data directory, not a build input.
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.pgliteDataDir);
  fs.mkdirSync(dir, { recursive: true });
  const db = await createPglite(dir);
  await migrate(db, { withShim: true });
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.profiles");
  if (rows[0].n === 0) await seedDemoData(db);
  return db;
}

/** Process-wide database handle (survives dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__chargeshareDb) {
    g.__chargeshareDb = init().catch((e) => {
      g.__chargeshareDb = undefined;
      throw e;
    });
  }
  return g.__chargeshareDb;
}
