import type { Db, Queryable } from "@/lib/db/core";
import { AppError } from "@/lib/errors";

export type Role = "driver" | "host" | "admin";

/** The authenticated caller, resolved server-side from the session. */
export interface Actor {
  userId: string;
  roles: Role[];
  restricted?: boolean;
}

export function requireRole(actor: Actor | null, role: Role): asserts actor is Actor {
  if (!actor) throw new AppError("unauthenticated", "Please sign in to continue.");
  if (!actor.roles.includes(role)) throw new AppError("forbidden", "You do not have access to this action.");
}

export function requireActive(actor: Actor) {
  if (actor.restricted) {
    throw new AppError("forbidden", "Your account is restricted. Contact support for help.");
  }
}

export async function loadActor(q: Queryable, userId: string): Promise<Actor | null> {
  const { rows } = await q.query<{ id: string; is_restricted: boolean; roles: Role[] | null }>(
    `select p.id, p.is_restricted, array_remove(array_agg(r.role::text), null) as roles
       from public.profiles p left join public.user_roles r on r.user_id = p.id
      where p.id = $1 group by p.id`,
    [userId],
  );
  if (!rows[0]) return null;
  return { userId, roles: (rows[0].roles ?? []) as Role[], restricted: rows[0].is_restricted };
}

export async function getSettingNumber(q: Queryable, key: string): Promise<number> {
  const { rows } = await q.query<{ value: unknown }>("select value from public.platform_settings where key = $1", [key]);
  if (!rows[0]) throw new Error(`missing platform setting ${key}`);
  return Number(rows[0].value);
}

export async function audit(
  q: Queryable,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  opts: { before?: unknown; after?: unknown; reason?: string | null } = {},
) {
  await q.query(
    `insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, before_state, after_state)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actorId,
      action,
      targetType,
      targetId,
      opts.reason ?? null,
      opts.before === undefined ? null : JSON.stringify(opts.before),
      opts.after === undefined ? null : JSON.stringify(opts.after),
    ],
  );
}

/** In-app notification, plus an optional email copy queued for delivery after the transaction commits. */
export async function notify(
  q: Queryable,
  userId: string,
  n: { type: string; title: string; body?: string; link?: string; email?: boolean },
) {
  await q.query(
    `insert into public.notifications (user_id, type, title, body, link, channel) values ($1, $2, $3, $4, $5, 'in_app')`,
    [userId, n.type, n.title, n.body ?? "", n.link ?? null],
  );
  if (n.email) {
    await q.query(
      `insert into public.notifications (user_id, type, title, body, link, channel, read_at, delivery_status)
       values ($1, $2, $3, $4, $5, 'email', now(), 'pending')`,
      [userId, n.type, n.title, n.body ?? "", n.link ?? null],
    );
  }
}

export async function adminIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ user_id: string }>("select user_id from public.user_roles where role = 'admin'");
  return rows.map((r) => r.user_id);
}

export type { Db, Queryable };
