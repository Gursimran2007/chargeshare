import { adminIds, notify, type Db } from "./common";

/**
 * Expires unpaid holds and unanswered requests across all listings, releasing
 * their slots and telling drivers. Safe to run often: it only touches rows whose
 * deadline has passed and that have no captured payment.
 */
export async function sweepExpiredBookings(db: Db, now = new Date()) {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; driver_id: string; code: string; from_status: string }>(
      `with expired as (
         update public.bookings b set status = 'expired'
          where b.status in ('pending_payment', 'requested') and b.hold_expires_at < $1
            and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'captured')
          returning b.id, b.driver_id, b.code,
            (select e.to_status::text from public.booking_events e where e.booking_id = b.id order by e.created_at desc, e.id desc limit 1) as from_status)
       select * from expired`,
      [now],
    );
    for (const r of rows) {
      await q.query(
        "insert into public.booking_events (booking_id, from_status, to_status, actor_role, note) values ($1, $2::booking_status, 'expired', 'system', $3)",
        [r.id, r.from_status, r.from_status === "requested" ? "Host did not respond in time" : "Payment window elapsed"],
      );
      await notify(q, r.driver_id, {
        type: "booking_expired",
        title: `Booking ${r.code} expired`,
        body: r.from_status === "requested" ? "The host did not respond in time. You were not charged." : "Payment was not completed in time, so the slot was released. You were not charged.",
        link: `/bookings/${r.id}`,
      });
    }
    return rows.length;
  });
}

/**
 * Nudges hosts once a request has used half of its response window, so requests
 * are answered rather than silently expiring.
 */
export async function remindHostsOfRequests(db: Db, now = new Date()) {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; host_id: string; code: string; hold_expires_at: Date }>(
      `update public.bookings set host_reminded_at = $1
        where status = 'requested' and host_reminded_at is null and hold_expires_at > $1
          and $1::timestamptz >= created_at + (hold_expires_at - created_at) / 2
        returning id, host_id, code, hold_expires_at`,
      [now],
    );
    for (const r of rows) {
      const hours = Math.max(1, Math.round((new Date(r.hold_expires_at).getTime() - now.getTime()) / 3_600_000));
      await notify(q, r.host_id, {
        type: "request_reminder",
        title: `Request ${r.code} expires in about ${hours} hour${hours > 1 ? "s" : ""}`,
        body: "Accept or decline so the driver can plan. Unanswered requests expire automatically.",
        link: `/bookings/${r.id}`,
        email: true,
      });
    }
    return rows.length;
  });
}

/** How long after a slot ends before an unconfirmed session is escalated. */
export const ESCALATE_AFTER_HOURS = 2;

/**
 * Sessions whose slot ended without the host confirming completion are escalated
 * once: admins are alerted, the host is asked to confirm, and the driver is asked
 * to report a problem if the session did not happen. Host payouts stay pending
 * until the outcome is recorded.
 */
export async function escalateUnconfirmedSessions(db: Db, now = new Date()) {
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; host_id: string; driver_id: string; code: string; status: string }>(
      `update public.bookings set escalated_at = $1
        where status in ('confirmed', 'checked_in', 'in_progress') and escalated_at is null
          and end_at < $1::timestamptz - make_interval(hours => $2)
        returning id, host_id, driver_id, code, status::text`,
      [now, ESCALATE_AFTER_HOURS],
    );
    const admins = rows.length ? await adminIds(q) : [];
    for (const r of rows) {
      for (const a of admins) {
        await notify(q, a, {
          type: "session_unconfirmed",
          title: `Session ${r.code} ended without confirmation`,
          body: `Status is still "${r.status.replace("_", " ")}". Check with the host and driver, then complete, refund or cancel.`,
          link: `/bookings/${r.id}`,
          email: true,
        });
      }
      await notify(q, r.host_id, {
        type: "session_unconfirmed",
        title: `Please confirm how session ${r.code} went`,
        body: "Mark it completed so your earnings become eligible for payout, or contact support if the driver did not arrive.",
        link: `/bookings/${r.id}`,
        email: true,
      });
      await notify(q, r.driver_id, {
        type: "session_unconfirmed",
        title: `Did your session ${r.code} happen?`,
        body: "If you could not charge, report a problem from the booking within 72 hours.",
        link: `/bookings/${r.id}`,
      });
    }
    return rows.length;
  });
}

export interface MaintenanceResult {
  expired: number;
  reminded: number;
  escalated: number;
}

/** All scheduled follow-ups. Each step is idempotent and safe to run often. */
export async function runMaintenance(db: Db, now = new Date()): Promise<MaintenanceResult> {
  const expired = await sweepExpiredBookings(db, now);
  const reminded = await remindHostsOfRequests(db, now);
  const escalated = await escalateUnconfirmedSessions(db, now);
  return { expired, reminded, escalated };
}

const g = globalThis as unknown as { __csLastSweep?: number };

/** Throttled maintenance (at most once a minute per process) for pages that list bookings. */
export async function maybeSweep(db: Db) {
  const t = Date.now();
  if (g.__csLastSweep && t - g.__csLastSweep < 60_000) return;
  g.__csLastSweep = t;
  await runMaintenance(db).catch((e) => console.error("[maintenance]", e));
}
