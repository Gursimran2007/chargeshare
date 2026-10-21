import { createPglite, migrate, type Db } from "@/lib/db/core";
import { seedDemoData } from "@/lib/seed";
import { loadActor, type Actor } from "@/lib/services/common";

/** Fresh in-memory Postgres with all migrations applied. */
export async function freshDb(): Promise<Db> {
  const db = await createPglite();
  await migrate(db, { withShim: true });
  return db;
}

export async function seededDb(now = new Date()): Promise<Db> {
  const db = await freshDb();
  await seedDemoData(db, now);
  return db;
}

export async function actorByEmail(db: Db, email: string): Promise<Actor> {
  const { rows } = await db.query<{ id: string }>("select id from auth.users where email = $1", [email]);
  if (!rows[0]) throw new Error(`no user ${email}`);
  return (await loadActor(db, rows[0].id))!;
}

export async function listingByTitle(db: Db, fragment: string) {
  const { rows } = await db.query<{ id: string; host_id: string }>("select id, host_id from public.charger_listings where title ilike $1", [`%${fragment}%`]);
  if (!rows[0]) throw new Error(`no listing ${fragment}`);
  return rows[0];
}

export async function defaultVehicle(db: Db, userId: string) {
  const { rows } = await db.query<{ id: string }>("select id from public.vehicles where owner_id = $1 order by is_default desc limit 1", [userId]);
  return rows[0].id;
}

/** YYYY-MM-DD in IST, `days` from now. */
export function istDate(days: number, from = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(from.getTime() + days * 86400_000));
}

export async function expectAppError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c !== code) throw new Error(`expected ${code}, got ${c}: ${(e as Error).message}`);
    return e as Error;
  }
  throw new Error(`expected ${code} error, but it resolved`);
}

/** Expire every open hold so per-driver hold limits do not leak between test cases. */
export async function releaseHolds(db: Db) {
  await db.query("update public.bookings set status = 'expired' where status in ('pending_payment', 'requested')");
}
