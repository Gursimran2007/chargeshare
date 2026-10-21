import { AppError } from "@/lib/errors";
import { audit, notify, requireRole, type Actor, type Db, type Queryable } from "./common";

export interface HostEarnings {
  grossBookingPaise: number; // what drivers paid for this host's sessions (before refunds)
  commissionPaise: number; // platform commission, net of reversals
  refundsPaise: number;
  netEarningsPaise: number; // host share, net of refund reversals
  pendingPaise: number; // host share on sessions not yet completed
  heldPaise: number; // host share on disputed sessions
  eligiblePaise: number; // host share on completed sessions
  paidOutPaise: number;
  inFlightPayoutPaise: number; // pending / processing payouts
  availablePaise: number; // eligible minus payouts (not failed)
}

/** Earnings summary computed from the append-only ledger. */
export async function hostEarnings(q: Queryable, hostId: string): Promise<HostEarnings> {
  const { rows } = await q.query<Record<string, number>>(
    `select
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'booking_gross'), 0)::int as gross,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'platform_commission'), 0)::int as commission,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'refund'), 0)::int as refunds,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'host_share'), 0)::int as net,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'host_share' and b.status in ('confirmed','checked_in','in_progress')), 0)::int as pending,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'host_share' and b.status = 'disputed'), 0)::int as held,
       coalesce(sum(e.amount_paise) filter (where e.entry_type = 'host_share' and b.status in ('completed','refunded')), 0)::int as eligible
     from public.ledger_entries e join public.bookings b on b.id = e.booking_id
     where e.host_id = $1`,
    [hostId],
  );
  const { rows: p } = await q.query<{ paid: number; inflight: number }>(
    `select coalesce(sum(amount_paise) filter (where status = 'paid'), 0)::int as paid,
            coalesce(sum(amount_paise) filter (where status in ('pending','processing')), 0)::int as inflight
       from public.payouts where host_id = $1`,
    [hostId],
  );
  const r = rows[0];
  return {
    grossBookingPaise: r.gross,
    commissionPaise: r.commission,
    refundsPaise: r.refunds,
    netEarningsPaise: r.net,
    pendingPaise: r.pending,
    heldPaise: r.held,
    eligiblePaise: r.eligible,
    paidOutPaise: p[0].paid,
    inFlightPayoutPaise: p[0].inflight,
    availablePaise: Math.max(0, r.eligible - p[0].paid - p[0].inflight),
  };
}

/** Admin creates a payout for a host's available balance. Payouts are executed manually outside the app for now. */
export async function createPayout(db: Db, actor: Actor | null, hostId: string, periodLabel: string) {
  requireRole(actor, "admin");
  return db.tx(async (q) => {
    await q.query("select user_id from public.host_profiles where user_id = $1 for update", [hostId]);
    const e = await hostEarnings(q, hostId);
    if (e.availablePaise <= 0) throw new AppError("invalid", "This host has no balance available for payout.");
    const { rows } = await q.query<{ id: string }>(
      "insert into public.payouts (host_id, amount_paise, period_label, created_by) values ($1, $2, $3, $4) returning id",
      [hostId, e.availablePaise, periodLabel, actor.userId],
    );
    await audit(q, actor.userId, "payout.create", "payout", rows[0].id, { after: { hostId, amount: e.availablePaise } });
    await notify(q, hostId, {
      type: "payout",
      title: `Payout of ₹${(e.availablePaise / 100).toFixed(2)} scheduled`,
      link: "/host/earnings",
      email: true,
    });
    return rows[0].id;
  });
}

export async function updatePayoutStatus(
  db: Db,
  actor: Actor | null,
  payoutId: string,
  status: "processing" | "paid" | "failed",
  reference: string,
) {
  requireRole(actor, "admin");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; host_id: string; status: string; amount_paise: number }>(
      "select id, host_id, status::text, amount_paise from public.payouts where id = $1 for update",
      [payoutId],
    );
    const p = rows[0];
    if (!p) throw new AppError("not_found", "Payout not found.");
    const allowed: Record<string, string[]> = { pending: ["processing", "paid", "failed"], processing: ["paid", "failed"] };
    if (!allowed[p.status]?.includes(status)) throw new AppError("invalid", `A ${p.status} payout cannot become ${status}.`);
    if (status === "paid" && reference.trim().length < 4) throw new AppError("invalid", "Enter the bank/UPI transfer reference.");
    await q.query("update public.payouts set status = $2::payout_status, reference = nullif($3::text, ''), paid_at = case when $2::payout_status = 'paid' then now() end where id = $1", [
      payoutId,
      status,
      reference.trim(),
    ]);
    if (status === "paid") {
      await q.query(
        "insert into public.ledger_entries (payout_id, host_id, entry_type, amount_paise, memo) values ($1, $2, 'payout', $3, $4)",
        [payoutId, p.host_id, p.amount_paise, `Payout ref ${reference.trim()}`],
      );
    }
    await audit(q, actor.userId, `payout.${status}`, "payout", payoutId, { before: { status: p.status }, after: { status, reference } });
    await notify(q, p.host_id, { type: "payout", title: `Payout ${status}`, link: "/host/earnings", email: status !== "processing" });
  });
}

export interface PlatformMetrics {
  drivers: number;
  hosts: number;
  listingsSubmitted: number;
  listingsApproved: number;
  listingsActive: number;
  bookingRequests: number;
  paidBookings: number;
  completedSessions: number;
  conversionRate: number | null;
  repeatRate: number | null;
  cancellationRate: number | null;
  gbvPaise: number;
  commissionPaise: number;
  taxEstimatePaise: number;
  processingFeeEstimatePaise: number;
  netContributionPaise: number;
  refundsPaise: number;
  refundRate: number | null;
  payoutLiabilityPaise: number;
  utilisation: number | null;
  utilisationNote: string;
  demoShare: { bookings: number; listings: number };
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export async function platformMetrics(q: Queryable): Promise<PlatformMetrics> {
  const one = async (sql: string) => (await q.query<{ n: number }>(sql)).rows[0].n;
  const drivers = await one("select count(*)::int as n from public.user_roles where role = 'driver'");
  const hosts = await one("select count(*)::int as n from public.host_profiles");
  const listingsSubmitted = await one("select count(*)::int as n from public.charger_listings where status <> 'draft'");
  const listingsApproved = await one("select count(*)::int as n from public.charger_listings where approved_at is not null");
  const listingsActive = await one("select count(*)::int as n from public.charger_listings where status = 'active'");
  const bookingRequests = await one("select count(*)::int as n from public.bookings");
  const paidBookings = await one("select count(distinct booking_id)::int as n from public.payments where status in ('captured','refunded','partially_refunded')");
  const completedSessions = await one("select count(*)::int as n from public.bookings where status = 'completed'");
  const cancelled = await one("select count(*)::int as n from public.bookings where status = 'cancelled'");
  const { rows: rep } = await q.query<{ one: number; many: number }>(
    `select count(*) filter (where n >= 1)::int as one, count(*) filter (where n >= 2)::int as many
       from (select driver_id, count(*) as n from public.bookings
              where status in ('confirmed','checked_in','in_progress','completed','disputed','refunded') group by driver_id) t`,
  );
  const { rows: led } = await q.query<Record<string, number>>(
    `select
       coalesce(sum(amount_paise) filter (where entry_type = 'booking_gross'), 0)::int as gbv,
       coalesce(sum(amount_paise) filter (where entry_type = 'platform_commission'), 0)::int as commission,
       coalesce(sum(amount_paise) filter (where entry_type = 'tax_on_commission'), 0)::int as tax,
       coalesce(sum(amount_paise) filter (where entry_type = 'processing_fee'), 0)::int as fee,
       coalesce(sum(amount_paise) filter (where entry_type = 'refund'), 0)::int as refunds,
       coalesce(sum(amount_paise) filter (where entry_type = 'host_share'), 0)::int as host_share,
       coalesce(sum(amount_paise) filter (where entry_type = 'payout'), 0)::int as payouts
     from public.ledger_entries`,
  );
  const l = led[0];
  // Utilisation = booked charger-hours / offered charger-hours over the last 30 days.
  const { rows: util } = await q.query<{ booked: number; offered: number; sessions: number }>(
    `with listings as (select id from public.charger_listings where status = 'active'),
     offered as (
       select coalesce(sum(extract(epoch from (end_time - start_time)) / 3600.0 * (30.0 / 7)), 0) as h
         from public.availability_rules where listing_id in (select id from listings)),
     booked as (
       select coalesce(sum(duration_minutes) / 60.0, 0) as h, count(*) as n from public.bookings
        where status = 'completed' and start_at > now() - interval '30 days' and listing_id in (select id from listings))
     select (select h from booked)::float as booked, (select h from offered)::float as offered, (select n from booked)::int as sessions`,
  );
  const u = util[0];
  const enough = u.sessions >= 10;
  const demoBookings = await one("select count(*)::int as n from public.bookings where is_demo");
  const demoListings = await one("select count(*)::int as n from public.charger_listings where is_demo");
  return {
    drivers,
    hosts,
    listingsSubmitted,
    listingsApproved,
    listingsActive,
    bookingRequests,
    paidBookings,
    completedSessions,
    conversionRate: ratio(paidBookings, bookingRequests),
    repeatRate: ratio(rep[0].many, rep[0].one),
    cancellationRate: ratio(cancelled, bookingRequests),
    gbvPaise: l.gbv,
    commissionPaise: l.commission,
    taxEstimatePaise: l.tax,
    processingFeeEstimatePaise: l.fee,
    netContributionPaise: l.commission - l.tax - l.fee,
    refundsPaise: l.refunds,
    refundRate: ratio(l.refunds, l.gbv),
    payoutLiabilityPaise: l.host_share - l.payouts,
    utilisation: enough && u.offered > 0 ? u.booked / u.offered : null,
    utilisationNote: enough
      ? "Completed charger-hours ÷ offered charger-hours, last 30 days."
      : `Not enough completed sessions in the last 30 days (${u.sessions} of 10 needed) to report utilisation.`,
    demoShare: { bookings: demoBookings, listings: demoListings },
  };
}
