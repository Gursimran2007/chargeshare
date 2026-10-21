import { notify, type Db } from "./common";

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

const g = globalThis as unknown as { __csLastSweep?: number };

/** Throttled sweep (at most once a minute per process) for pages that list bookings. */
export async function maybeSweep(db: Db) {
  const t = Date.now();
  if (g.__csLastSweep && t - g.__csLastSweep < 60_000) return;
  g.__csLastSweep = t;
  await sweepExpiredBookings(db).catch((e) => console.error("[sweep]", e));
}
