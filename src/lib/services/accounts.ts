import { AppError } from "@/lib/errors";
import { type Actor, type Db } from "./common";

export async function updateProfile(db: Db, actor: Actor | null, input: { fullName: string; phone: string | null; city: string }) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  // Runs as the user so RLS and the profile guard apply.
  await db.asUser(actor.userId, (q) =>
    q.query("update public.profiles set full_name = $2, phone = $3, city = $4 where id = $1", [
      actor.userId,
      input.fullName,
      input.phone,
      input.city,
    ]),
  );
}

export async function addVehicle(
  db: Db,
  actor: Actor | null,
  v: {
    modelId: string | null;
    nickname: string;
    make: string;
    model: string;
    batteryKwh?: number;
    maxAcKw?: number;
    connectors: string[];
    isDefault: boolean;
  },
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  return db.asUser(actor.userId, async (q) => {
    const { rows: known } = await q.query<{ code: string }>("select code from public.connector_types where code = any($1)", [v.connectors]);
    if (known.length !== v.connectors.length) throw new AppError("invalid", "Unknown connector type.");
    const { rows: existing } = await q.query("select 1 from public.vehicles where owner_id = $1", [actor.userId]);
    const makeDefault = v.isDefault || existing.length === 0;
    if (makeDefault) await q.query("update public.vehicles set is_default = false where owner_id = $1", [actor.userId]);
    const { rows } = await q.query<{ id: string }>(
      `insert into public.vehicles (owner_id, model_id, nickname, make, model, battery_kwh, max_ac_kw, connectors, is_default)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [actor.userId, v.modelId, v.nickname, v.make, v.model, v.batteryKwh ?? null, v.maxAcKw ?? null, v.connectors, makeDefault],
    );
    return rows[0].id;
  });
}

export async function deleteVehicle(db: Db, actor: Actor | null, vehicleId: string) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  await db.asUser(actor.userId, (q) => q.query("delete from public.vehicles where id = $1", [vehicleId]));
}

export async function setDefaultVehicle(db: Db, actor: Actor | null, vehicleId: string) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  await db.asUser(actor.userId, async (q) => {
    const { rows } = await q.query("select 1 from public.vehicles where id = $1", [vehicleId]);
    if (!rows[0]) throw new AppError("not_found", "Vehicle not found.");
    await q.query("update public.vehicles set is_default = false where owner_id = $1", [actor.userId]);
    await q.query("update public.vehicles set is_default = true where id = $1", [vehicleId]);
  });
}

export async function markNotificationsRead(db: Db, actor: Actor | null) {
  if (!actor) return;
  await db.asUser(actor.userId, (q) =>
    q.query("update public.notifications set read_at = now() where user_id = $1 and read_at is null and channel = 'in_app'", [actor.userId]),
  );
}
