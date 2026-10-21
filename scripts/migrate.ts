/**
 * Applies supabase/migrations/*.sql to the database in DATABASE_URL
 * (e.g. your Supabase project's direct connection string). Idempotent.
 *   DATABASE_URL=postgres://... npm run db:migrate
 * Alternatively run `supabase db push` with the Supabase CLI.
 */
import { createPool, migrate } from "../src/lib/db/core";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Demo mode migrates its embedded database automatically on first run.");
  process.exit(1);
}
const db = await createPool(url);
await migrate(db, { withShim: false });
console.log("Migrations applied.");
await db.close();
