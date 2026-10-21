import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/domain";
import { Badge, Container } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime, formatTime } from "@/lib/domain/time";
import { brand } from "@/lib/brand";

export const metadata = { title: "Receipt" };

/** Driver-facing transaction record. Not a GST tax invoice (ChargeShare is pre-registration). */
export default async function ReceiptPage({ params }: PageProps<"/bookings/[id]/receipt">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer(`/bookings/${id}/receipt`);
  const db = await getDb();
  const { rows } = await db.query<{
    code: string; driver_id: string; status: string; start_at: Date; end_at: Date; duration_minutes: number;
    price_per_hour_paise: number; booking_fee_paise: number; amount_paise: number; title: string; locality: string;
    host_name: string; driver_name: string; driver_email: string; is_demo: boolean;
  }>(
    `select b.code, b.driver_id, b.status::text, b.start_at, b.end_at, b.duration_minutes, b.price_per_hour_paise, b.booking_fee_paise,
            b.amount_paise, b.is_demo, l.title, l.locality, h.display_name as host_name, p.full_name as driver_name, u.email as driver_email
       from public.bookings b join public.charger_listings l on l.id = b.listing_id
       join public.host_profiles h on h.user_id = b.host_id join public.profiles p on p.id = b.driver_id join auth.users u on u.id = b.driver_id
      where b.id = $1`,
    [id],
  );
  const b = rows[0];
  if (!b || (b.driver_id !== viewer.userId && !viewer.roles.includes("admin"))) notFound();
  const [{ rows: pay }, { rows: refunds }] = await Promise.all([
    db.query<{ provider: string; provider_payment_id: string | null; captured_at: Date | null; amount_paise: number; status: string }>(
      "select provider, provider_payment_id, captured_at, amount_paise, status::text from public.payments where booking_id = $1 and captured_at is not null order by captured_at",
      [id],
    ),
    db.query<{ amount_paise: number; reason: string; status: string; created_at: Date; provider_refund_id: string | null }>(
      "select amount_paise, reason, status::text, created_at, provider_refund_id from public.refunds where booking_id = $1 order by created_at",
      [id],
    ),
  ]);
  const paid = pay.reduce((s, p) => s + p.amount_paise, 0);
  const refunded = refunds.reduce((s, r) => s + r.amount_paise, 0);
  const simulated = pay.some((p) => p.provider === "demo");
  return (
    <Container className="max-w-2xl py-8 sm:py-12 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/bookings/${id}`} className="text-sm text-ink-500 hover:text-ink-900">← Back to booking</Link>
        <PrintButton />
      </div>
      <article className="rounded-xl border border-ink-200 bg-white p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 pb-5">
          <div>
            <Logo />
            <p className="mt-2 text-xs text-ink-500">{brand.legalEntity}</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Payment receipt</div>
            <div className="font-mono text-sm font-semibold">{b.code}</div>
            {pay[0]?.captured_at ? <div className="text-xs text-ink-500">Paid {formatDate(pay[0].captured_at)}</div> : null}
          </div>
        </header>
        {simulated || b.is_demo ? (
          <p className="mt-4 rounded-lg border border-warn-600/30 bg-warn-100/60 p-3 text-sm text-warn-600">
            Demo record: this payment was simulated. No money moved and this is not a valid receipt.
          </p>
        ) : null}
        {!pay.length ? <p className="mt-4 rounded-lg bg-ink-50 p-3 text-sm text-ink-600">No payment has been captured for this booking.</p> : null}
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink-500">Billed to</dt><dd className="font-medium">{b.driver_name}</dd><dd className="text-ink-500">{b.driver_email}</dd></div>
          <div><dt className="text-xs text-ink-500">Charging location</dt><dd className="font-medium">{b.title}</dd><dd className="text-ink-500">{b.locality} · hosted by {b.host_name}</dd></div>
          <div><dt className="text-xs text-ink-500">Session</dt><dd className="font-medium">{formatDateTime(b.start_at)} – {formatTime(b.end_at)}</dd></div>
          <div><dt className="text-xs text-ink-500">Booking status</dt><dd className="font-medium capitalize">{b.status.replace("_", " ")}</dd></div>
        </dl>
        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="py-2">Item</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            <tr><td className="py-2.5">Reserved charging time: {b.duration_minutes / 60} h × {formatINR(b.price_per_hour_paise)}/h</td><td className="py-2.5 text-right tabular-nums">{formatINR(b.amount_paise - b.booking_fee_paise, { decimals: true })}</td></tr>
            {b.booking_fee_paise ? <tr><td className="py-2.5">Host booking fee</td><td className="py-2.5 text-right tabular-nums">{formatINR(b.booking_fee_paise, { decimals: true })}</td></tr> : null}
            <tr className="font-semibold"><td className="py-2.5">Total charged</td><td className="py-2.5 text-right tabular-nums">{formatINR(paid || 0, { decimals: true })}</td></tr>
            {refunds.map((r, i) => (
              <tr key={i} className="text-stop-600"><td className="py-2.5">Refund ({r.status}) · {formatDate(r.created_at)}<div className="text-xs text-ink-500">{r.reason}</div></td><td className="py-2.5 text-right tabular-nums">−{formatINR(r.amount_paise, { decimals: true })}</td></tr>
            ))}
            {refunds.length ? <tr className="font-semibold"><td className="py-2.5">Net paid</td><td className="py-2.5 text-right tabular-nums">{formatINR(paid - refunded, { decimals: true })}</td></tr> : null}
          </tbody>
        </table>
        {pay[0] ? (
          <p className="mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            Payment reference <code className="font-mono">{pay[0].provider_payment_id}</code>
            <Badge tone={simulated ? "warn" : "neutral"}>{simulated ? "Simulated" : "Razorpay"}</Badge>
          </p>
        ) : null}
        <footer className="mt-8 border-t border-ink-100 pt-4 text-xs text-ink-500">
          Time-based charging reservation; energy is not metered by {brand.name}. This receipt is not a GST tax invoice. Questions: {brand.supportEmail}
        </footer>
      </article>
    </Container>
  );
}
