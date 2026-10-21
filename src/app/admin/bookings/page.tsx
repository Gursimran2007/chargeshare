import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Textarea } from "@/components/ui";
import { BookingStatusPill } from "@/components/domain";
import { refundAction, resolveDisputeAction } from "../actions";
import { getDb } from "@/lib/db";
import { maybeSweep } from "@/lib/services/maintenance";
import { emailDelivery } from "@/lib/email/delivery";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/domain/time";
import type { BookingStatus } from "@/lib/domain/booking-state";

export const metadata = { title: "Admin · Bookings" };

export default async function AdminBookings() {
  const db = await getDb();
  await maybeSweep(db, emailDelivery());
  const { rows } = await db.query<{
    id: string; code: string; status: BookingStatus; start_at: Date; amount_paise: number; title: string; driver: string; host: string;
    pay_status: string | null; provider: string | null; refunded: number; is_demo: boolean; dispute_note: string | null;
  }>(
    `select b.id, b.code, b.status, b.start_at, b.amount_paise, l.title, dp.full_name as driver, h.display_name as host, b.is_demo,
            p.status::text as pay_status, p.provider,
            coalesce((select sum(amount_paise) from public.refunds r where r.booking_id = b.id), 0)::int as refunded,
            (select note from public.booking_events e where e.booking_id = b.id and e.to_status = 'disputed' order by e.created_at desc limit 1) as dispute_note
       from public.bookings b
       join public.charger_listings l on l.id = b.listing_id
       join public.profiles dp on dp.id = b.driver_id
       join public.host_profiles h on h.user_id = b.host_id
       left join lateral (select status, provider from public.payments where booking_id = b.id order by created_at desc limit 1) p on true
      order by b.created_at desc limit 200`,
  );
  const { rows: events } = await db.query<{ event_type: string; outcome: string | null; received_at: Date; provider: string }>(
    "select event_type, outcome, received_at, provider from public.payment_events order by received_at desc limit 10",
  );
  const disputes = rows.filter((b) => b.status === "disputed");
  const { rows: unconfirmed } = await db.query<{ id: string; code: string; status: BookingStatus; end_at: Date; title: string; host: string; escalated_at: Date }>(
    `select b.id, b.code, b.status, b.end_at, l.title, h.display_name as host, b.escalated_at
       from public.bookings b join public.charger_listings l on l.id = b.listing_id join public.host_profiles h on h.user_id = b.host_id
      where b.escalated_at is not null and b.status in ('confirmed', 'checked_in', 'in_progress') order by b.end_at`,
  );
  return (
    <div className="space-y-8">
      {unconfirmed.length ? (
        <section>
          <h1 className="mb-2 text-2xl font-semibold">Needs attention</h1>
          <p className="mb-4 text-sm text-ink-500">Slots that ended over 2 hours ago without the host confirming the outcome. Host payouts for these stay pending. Open each booking to complete it, cancel and refund, or contact both parties.</p>
          <ul className="divide-y divide-ink-100 rounded-xl border border-warn-600/30 bg-white">
            {unconfirmed.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <Link href={`/bookings/${b.id}`} className="font-semibold text-volt-700 hover:underline">{b.code}</Link>
                  <span className="text-ink-500"> · {b.title} · host {b.host}</span>
                  <div className="text-xs text-ink-500">Slot ended {formatDateTime(b.end_at)} · escalated {formatDateTime(b.escalated_at)}</div>
                </div>
                <BookingStatusPill status={b.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Disputes</h1>
        {disputes.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {disputes.map((b) => (
              <Card key={b.id} className="p-5">
                <div className="flex items-center justify-between">
                  <Link href={`/bookings/${b.id}`} className="font-semibold hover:underline">{b.code}</Link>
                  {b.is_demo ? <Badge tone="warn">Demo</Badge> : null}
                </div>
                <p className="text-sm text-ink-500">{b.title} · {b.driver} ↔ {b.host} · paid {formatINR(b.amount_paise, { decimals: true })}</p>
                {b.dispute_note ? <p className="mt-2 rounded-xl bg-stop-100/60 p-3 text-sm">{b.dispute_note}</p> : null}
                <ActionForm action={resolveDisputeAction} hidden={{ bookingId: b.id }} submit="Resolve dispute" className="mt-3">
                  <Field label="Refund to driver (₹, 0 for none)" htmlFor={`rf-${b.id}`} hint={`Max ${formatINR(b.amount_paise - b.refunded, { decimals: true })}`}>
                    <Input id={`rf-${b.id}`} name="refund" type="number" min="0" step="0.01" defaultValue="0" />
                  </Field>
                  <Field label="Resolution note (sent to both parties)" htmlFor={`n-${b.id}`}><Textarea id={`n-${b.id}`} name="note" required /></Field>
                </ActionForm>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">No open disputes.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">All bookings & payments</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Listing</th><th className="px-4 py-3">Driver / Host</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Refund</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3"><Link href={`/bookings/${b.id}`} className="font-semibold text-volt-700 hover:underline">{b.code}</Link></td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(b.start_at)}</td>
                  <td className="max-w-48 truncate px-4 py-3">{b.title}</td>
                  <td className="px-4 py-3 text-xs">{b.driver}<br /><span className="text-ink-500">{b.host}</span></td>
                  <td className="px-4 py-3"><BookingStatusPill status={b.status} /></td>
                  <td className="px-4 py-3 text-xs">{b.pay_status ?? "—"}{b.provider === "demo" ? <Badge tone="warn" className="ml-1">demo</Badge> : null}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.amount_paise, { decimals: true })}{b.refunded ? <div className="text-xs text-stop-600">−{formatINR(b.refunded, { decimals: true })}</div> : null}</td>
                  <td className="px-4 py-3">
                    {b.pay_status && ["captured", "partially_refunded"].includes(b.pay_status) ? (
                      <ActionForm action={refundAction} hidden={{ bookingId: b.id }} submit="Refund" variant="ghost" confirm={{ title: `Refund ${b.code}`, body: "Refunds reverse host share and commission proportionally and are recorded in the audit log.", label: "Issue refund" }}>
                        <Field label="Amount (₹)" htmlFor={`ra-${b.id}`}><Input id={`ra-${b.id}`} name="amount" type="number" step="0.01" min="0.01" max={(b.amount_paise - b.refunded) / 100} required /></Field>
                        <Field label="Reason" htmlFor={`rr-${b.id}`}><Input id={`rr-${b.id}`} name="reason" required /></Field>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent payment webhooks</h2>
        <Card className="divide-y divide-ink-100 text-sm">
          {events.length ? events.map((e, i) => (
            <div key={i} className="flex justify-between p-3"><span>{e.provider} · {e.event_type}</span><span className="text-ink-500">{e.outcome} · {formatDateTime(e.received_at)}</span></div>
          )) : <p className="p-3 text-ink-500">No webhook events received yet.</p>}
        </Card>
      </section>
    </div>
  );
}
