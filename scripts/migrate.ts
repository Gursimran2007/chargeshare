/**
 * Applies supabase/migrations/*.sql to the database in DATABASE_URL. Idempotent.
 *   DATABASE_URL=postgres://... npm run db:migrate
 * - Supabase: run as-is (or use `supabase db push`).
 * - Plain Postgres with AUTH_PROVIDER=local: the local auth shim (roles, auth schema)
 *   is applied first, because Supabase's auth schema does not exist there.
 */
import { createPool, migrate } from "../src/lib/db/core";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Demo mode migrates its embedded database automatically on first run.");
  process.exit(1);
}
const db = await createPool(url);
await migrate(db, { withShim: process.env.AUTH_PROVIDER === "local" });
console.log("Migrations applied.");
await db.close();
