import { AppError } from "@/lib/errors";
import { rupees, toCsv, type Cell } from "@/lib/csv";
import { audit, requireRole, type Actor, type Db } from "./common";

type Row = Record<string, Cell>;

export const EXPORT_KINDS = ["ledger", "payouts", "bookings", "refunds"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface DateRange {
  from: string | null; // YYYY-MM-DD, IST, inclusive
  to: string | null; // YYYY-MM-DD, IST, inclusive
}

export function parseRange(from: string | null, to: string | null): DateRange {
  const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const r = { from: ok(from), to: ok(to) };
  if (r.from && r.to && r.from > r.to) throw new AppError("invalid", "The start date must be before the end date.");
  return r;
}

// Range bounds as IST calendar days, applied to the row's timestamp column.
const RANGE = (col: string) =>
  `($1::date is null or ${col} >= ($1::date::timestamp at time zone 'Asia/Kolkata'))
   and ($2::date is null or ${col} < (($2::date + 1)::timestamp at time zone 'Asia/Kolkata'))`;

/** Admin finance export. Every export is written to the audit log. */
export async function adminExport(db: Db, actor: Actor | null, kind: ExportKind, range: DateRange) {
  requireRole(actor, "admin");
  const p = [range.from, range.to];
  let csv: string;
  if (kind === "ledger") {
    const { rows } = await db.query<Row>(
      `select e.id, e.created_at, e.entry_type::text as entry_type, e.amount_paise, e.is_estimate, e.memo, b.code,
              h.display_name as host, e.payment_id, e.refund_id, e.payout_id, coalesce(b.is_demo, false) as is_demo
         from public.ledger_entries e
         left join public.bookings b on b.id = e.booking_id
         left join public.host_profiles h on h.user_id = e.host_id
        where ${RANGE("e.created_at")} order by e.created_at, e.id`,
      p,
    );
    csv = toCsv(
      ["entry_id", "created_at_utc", "entry_type", "amount_inr", "is_estimate", "memo", "booking_code", "host", "payment_id", "refund_id", "payout_id", "demo_data"],
      rows.map((r: Row) => [r.id, r.created_at, r.entry_type, rupees(Number(r.amount_paise)), r.is_estimate, r.memo, r.code, r.host, r.payment_id, r.refund_id, r.payout_id, r.is_demo]),
    );
  } else if (kind === "payouts") {
    const { rows } = await db.query<Row>(
      `select p.id, p.created_at, p.paid_at, h.display_name as host, p.amount_paise, p.status::text as status, p.period_label, p.reference
         from public.payouts p join public.host_profiles h on h.user_id = p.host_id
        where ${RANGE("p.created_at")} order by p.created_at`,
      p,
    );
    csv = toCsv(
      ["payout_id", "created_at_utc", "paid_at_utc", "host", "amount_inr", "status", "period", "transfer_reference"],
      rows.map((r: Row) => [r.id, r.created_at, r.paid_at, r.host, rupees(Number(r.amount_paise)), r.status, r.period_label, r.reference]),
    );
  } else if (kind === "bookings") {
    const { rows } = await db.query<Row>(
      `select b.code, b.created_at, b.start_at, b.end_at, b.status::text as status, l.title, l.locality, h.display_name as host,
              b.amount_paise, b.commission_bps, b.commission_paise, b.host_share_paise,
              coalesce((select sum(r.amount_paise) from public.refunds r where r.booking_id = b.id and r.status <> 'failed'), 0)::int as refunded_paise,
              (select pm.provider from public.payments pm where pm.booking_id = b.id and pm.captured_at is not null limit 1) as provider,
              b.cancelled_by, b.completion_method, b.is_demo
         from public.bookings b join public.charger_listings l on l.id = b.listing_id join public.host_profiles h on h.user_id = b.host_id
        where ${RANGE("b.created_at")} order by b.created_at`,
      p,
    );
    csv = toCsv(
      ["booking_code", "created_at_utc", "start_utc", "end_utc", "status", "listing", "locality", "host", "amount_inr", "commission_pct", "commission_inr", "host_share_inr", "refunded_inr", "payment_provider", "cancelled_by", "completion_method", "demo_data"],
      rows.map((r: Row) => [r.code, r.created_at, r.start_at, r.end_at, r.status, r.title, r.locality, r.host, rupees(Number(r.amount_paise)), Number(r.commission_bps) / 100, rupees(Number(r.commission_paise)), rupees(Number(r.host_share_paise)), rupees(Number(r.refunded_paise)), r.provider, r.cancelled_by, r.completion_method, r.is_demo]),
    );
  } else {
    const { rows } = await db.query<Row>(
      `select r.id, r.created_at, r.processed_at, b.code, r.amount_paise, r.host_portion_paise, r.commission_portion_paise,
              r.status::text as status, r.initiated_role, r.reason, r.provider_refund_id, b.is_demo
         from public.refunds r join public.bookings b on b.id = r.booking_id
        where ${RANGE("r.created_at")} order by r.created_at`,
      p,
    );
    csv = toCsv(
      ["refund_id", "created_at_utc", "processed_at_utc", "booking_code", "amount_inr", "host_portion_inr", "commission_portion_inr", "status", "initiated_by", "reason", "provider_refund_id", "demo_data"],
      rows.map((r: Row) => [r.id, r.created_at, r.processed_at, r.code, rupees(Number(r.amount_paise)), rupees(Number(r.host_portion_paise)), rupees(Number(r.commission_portion_paise)), r.status, r.initiated_role, r.reason, r.provider_refund_id, r.is_demo]),
    );
  }
  await audit(db, actor.userId, `export.${kind}`, "export", kind, { after: range });
  return csv;
}

/**
 * Host earnings statement. Read as the host, so Row Level Security limits it to
 * their own host-share and payout ledger lines.
 */
export async function hostStatement(db: Db, actor: Actor | null, range: DateRange) {
  requireRole(actor, "host");
  const { rows } = await db.asUser(actor.userId, (q) =>
    q.query<Row>(
      `select e.created_at, e.entry_type::text as entry_type, e.amount_paise, e.memo, b.code, b.start_at, l.title
         from public.ledger_entries e
         left join public.bookings b on b.id = e.booking_id
         left join public.charger_listings l on l.id = b.listing_id
        where ${RANGE("e.created_at")} order by e.created_at, e.id`,
      [range.from, range.to],
    ),
  );
  const label: Record<string, string> = { host_share: "Host share (after commission)", payout: "Payout" };
  return toCsv(
    ["date_utc", "type", "amount_inr", "booking_code", "session_start_utc", "listing", "memo"],
    rows.map((r: Row) => [r.created_at, label[String(r.entry_type)] ?? r.entry_type, rupees(Number(r.amount_paise)), r.code, r.start_at, r.title, r.memo]),
  );
}
