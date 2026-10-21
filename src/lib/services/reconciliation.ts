import type { Queryable } from "./common";

export interface ReconciliationCheck {
  id: string;
  title: string;
  rule: string;
  ok: boolean;
  count: number;
  offenders: { label: string; bookingId: string | null; detail: string }[];
}

interface Offender {
  label: string;
  booking_id: string | null;
  detail: string;
}

const CHECKS: { id: string; title: string; rule: string; sql: string }[] = [
  {
    id: "capture_posted",
    title: "Every captured payment is in the ledger",
    rule: "A captured payment has exactly one booking_gross entry equal to the amount captured.",
    sql: `select b.code as label, b.id as booking_id, 'payment ' || p.provider_order_id || ' captured ₹' || (p.amount_paise / 100.0)::text as detail
            from public.payments p join public.bookings b on b.id = p.booking_id
           where p.captured_at is not null
             and (select count(*) from public.ledger_entries e
                   where e.payment_id = p.id and e.entry_type = 'booking_gross' and e.refund_id is null and e.amount_paise = p.amount_paise) <> 1`,
  },
  {
    id: "split_balances",
    title: "Host share + commission = what the driver paid",
    rule: "For each captured payment, the capture's host_share and platform_commission entries add up to booking_gross.",
    sql: `select b.code as label, b.id as booking_id,
                 'gross ' || g.gross || ' vs split ' || coalesce(s.split, 0) as detail
            from (select payment_id, sum(amount_paise) as gross from public.ledger_entries
                   where entry_type = 'booking_gross' and refund_id is null group by payment_id) g
            left join (select payment_id, sum(amount_paise) as split from public.ledger_entries
                        where entry_type in ('host_share', 'platform_commission') and refund_id is null and payout_id is null
                        group by payment_id) s on s.payment_id = g.payment_id
            join public.payments p on p.id = g.payment_id join public.bookings b on b.id = p.booking_id
           where g.gross <> coalesce(s.split, 0)`,
  },
  {
    id: "payment_matches_booking",
    title: "Captured amount matches the booking price",
    rule: "The amount captured equals the server-computed booking amount.",
    sql: `select b.code as label, b.id as booking_id, 'booking ₹' || (b.amount_paise / 100.0) || ' vs captured ₹' || (p.amount_paise / 100.0) as detail
            from public.payments p join public.bookings b on b.id = p.booking_id
           where p.captured_at is not null and p.amount_paise <> b.amount_paise`,
  },
  {
    id: "refunds_posted",
    title: "Every refund is reversed in the ledger",
    rule: "Each non-failed refund has a refund entry for its amount, and host-share plus commission reversals totalling minus that amount.",
    sql: `select b.code as label, b.id as booking_id, 'refund ₹' || (r.amount_paise / 100.0) as detail
            from public.refunds r join public.bookings b on b.id = r.booking_id
           where r.status <> 'failed' and (
             coalesce((select sum(amount_paise) from public.ledger_entries where refund_id = r.id and entry_type = 'refund'), 0) <> r.amount_paise
             or coalesce((select sum(amount_paise) from public.ledger_entries where refund_id = r.id and entry_type in ('host_share', 'platform_commission')), 0) <> -r.amount_paise)`,
  },
  {
    id: "refunds_within_payment",
    title: "No payment is refunded more than it captured",
    rule: "Total non-failed refunds on a payment never exceed its captured amount.",
    sql: `select b.code as label, b.id as booking_id, 'refunded ₹' || (sum(r.amount_paise) / 100.0) || ' of ₹' || (p.amount_paise / 100.0) as detail
            from public.refunds r join public.payments p on p.id = r.payment_id join public.bookings b on b.id = r.booking_id
           where r.status <> 'failed' group by b.code, b.id, p.amount_paise having sum(r.amount_paise) > p.amount_paise`,
  },
  {
    id: "payment_status_consistent",
    title: "Payment status agrees with its refunds",
    rule: "captured = no refunds; partially_refunded = some; refunded = all of the amount.",
    sql: `select b.code as label, b.id as booking_id, p.status::text || ' with ₹' || (coalesce(r.total, 0) / 100.0) || ' refunded' as detail
            from public.payments p join public.bookings b on b.id = p.booking_id
            left join (select payment_id, sum(amount_paise) as total from public.refunds where status <> 'failed' group by payment_id) r on r.payment_id = p.id
           where p.captured_at is not null and not (
             (p.status = 'captured' and coalesce(r.total, 0) = 0)
             or (p.status = 'partially_refunded' and r.total > 0 and r.total < p.amount_paise)
             or (p.status = 'refunded' and r.total = p.amount_paise))`,
  },
  {
    id: "payouts_posted",
    title: "Paid payouts are in the ledger, unpaid ones are not",
    rule: "A paid payout has exactly one payout entry for its amount; pending, processing or failed payouts have none.",
    sql: `select h.display_name as label, null::uuid as booking_id, 'payout ' || po.status::text || ' ₹' || (po.amount_paise / 100.0) as detail
            from public.payouts po join public.host_profiles h on h.user_id = po.host_id
           where (po.status = 'paid') <> exists (select 1 from public.ledger_entries e where e.payout_id = po.id and e.entry_type = 'payout' and e.amount_paise = po.amount_paise)
              or (select count(*) from public.ledger_entries e where e.payout_id = po.id) > 1`,
  },
  {
    id: "hosts_not_overpaid",
    title: "No host has been paid more than they earned",
    rule: "Paid + in-flight payouts never exceed the host's share on completed sessions (net of refunds).",
    sql: `select h.display_name as label, null::uuid as booking_id,
                 'paid/in-flight ₹' || (po.total / 100.0) || ' vs eligible ₹' || (coalesce(el.total, 0) / 100.0) as detail
            from (select host_id, sum(amount_paise) as total from public.payouts where status <> 'failed' group by host_id) po
            join public.host_profiles h on h.user_id = po.host_id
            left join (select e.host_id, sum(e.amount_paise) as total from public.ledger_entries e join public.bookings b on b.id = e.booking_id
                        where e.entry_type = 'host_share' and b.status in ('completed', 'refunded') group by e.host_id) el on el.host_id = po.host_id
           where po.total > coalesce(el.total, 0)`,
  },
  {
    id: "paid_states_have_payment",
    title: "Bookings in paid states have a captured payment",
    rule: "Confirmed, in-progress, completed, disputed and refunded bookings all have a captured payment.",
    sql: `select b.code as label, b.id as booking_id, 'status ' || b.status::text as detail
            from public.bookings b
           where b.status in ('confirmed', 'checked_in', 'in_progress', 'completed', 'disputed', 'refunded')
             and not exists (select 1 from public.payments p where p.booking_id = b.id and p.captured_at is not null)`,
  },
];

/** Read-only integrity checks over money and booking state. Any failure needs investigation. */
export async function reconcile(q: Queryable): Promise<ReconciliationCheck[]> {
  const out: ReconciliationCheck[] = [];
  for (const c of CHECKS) {
    const { rows } = await q.query<Offender>(c.sql);
    out.push({
      id: c.id,
      title: c.title,
      rule: c.rule,
      ok: rows.length === 0,
      count: rows.length,
      offenders: rows.slice(0, 20).map((r) => ({ label: r.label, bookingId: r.booking_id, detail: r.detail })),
    });
  }
  return out;
}
