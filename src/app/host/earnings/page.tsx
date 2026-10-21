import { Download } from "lucide-react";
import { Container, PageHeader, Stat, Card, Badge } from "@/components/ui";
import { HostNav } from "../host-nav";
import { getDb } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { hostEarnings } from "@/lib/services/finance";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/domain/time";
import { config } from "@/lib/config";

export const metadata = { title: "Earnings" };

const TYPE_LABEL: Record<string, string> = { host_share: "Host share", payout: "Payout" };

export default async function EarningsPage() {
  const viewer = await requireRolePage("host", "/host/earnings");
  const db = await getDb();
  const e = await hostEarnings(db, viewer.userId);
  // Hosts read their ledger through RLS: only their own host_share and payout rows are visible.
  const ledger = await db.asUser(viewer.userId, (q) =>
    q.query<{ id: number; entry_type: string; amount_paise: number; memo: string; created_at: Date; booking_id: string | null }>(
      "select id, entry_type, amount_paise, memo, created_at, booking_id from public.ledger_entries order by created_at desc, id desc limit 100",
    ),
  );
  const { rows: payouts } = await db.query<{ id: string; amount_paise: number; status: string; period_label: string; reference: string | null; created_at: Date; paid_at: Date | null }>(
    "select * from public.payouts where host_id = $1 order by created_at desc",
    [viewer.userId],
  );
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Host"
        title="Earnings"
        subtitle="Every figure below is computed from an append-only ledger. Hosts cannot edit payment or payout records."
        actions={
          // A plain link: the browser downloads the CSV from the route handler.
          <a href="/api/host/exports/earnings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold hover:bg-ink-50">
            <Download className="size-4" aria-hidden /> Download statement (CSV)
          </a>
        }
      />
      <HostNav />
      {config.demoMode ? (
        <p className="mb-4 rounded-xl border border-warn-600/30 bg-warn-100/60 p-3 text-sm text-ink-700">
          Demo data: these earnings come from simulated payments, and payouts marked &ldquo;paid&rdquo; are simulated records. No money has moved.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross booking value" value={formatINR(e.grossBookingPaise)} hint="What drivers paid for your sessions" />
        <Stat label="Platform commission" value={formatINR(e.commissionPaise)} hint="Net of refund reversals" />
        <Stat label="Refunds to drivers" value={formatINR(e.refundsPaise)} />
        <Stat label="Your net earnings" value={formatINR(e.netEarningsPaise)} tone="go" />
        <Stat label="Pending sessions" value={formatINR(e.pendingPaise)} hint="Becomes eligible after completion" />
        <Stat label="Held (disputed)" value={formatINR(e.heldPaise)} tone={e.heldPaise ? "warn" : undefined} />
        <Stat label="Paid out" value={formatINR(e.paidOutPaise)} hint={e.inFlightPayoutPaise ? `${formatINR(e.inFlightPayoutPaise)} in progress` : undefined} />
        <Stat label="Available for payout" value={formatINR(e.availablePaise)} tone="volt" />
      </div>
      <p className="mt-3 text-xs text-ink-500">Payouts are reviewed and sent manually by ChargeShare (bank/UPI transfer) while automated payouts are being set up; &ldquo;paid&rdquo; means our team recorded the transfer reference shown. Tax treatment of your earnings depends on your circumstances; consult a tax professional.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <h2 className="border-b border-ink-100 p-4 font-semibold">Ledger</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Entry</th><th className="px-4 py-2.5">Memo</th><th className="px-4 py-2.5 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {ledger.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2.5">{TYPE_LABEL[r.entry_type] ?? r.entry_type}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.memo}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.amount_paise < 0 ? "text-stop-600" : ""}`}>{formatINR(r.amount_paise, { decimals: true })}</td>
                  </tr>
                ))}
                {!ledger.rows.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-500">No entries yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <h2 className="border-b border-ink-100 p-4 font-semibold">Payouts</h2>
          <ul className="divide-y divide-ink-100">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <div className="font-semibold">{formatINR(p.amount_paise, { decimals: true })}</div>
                  <div className="text-xs text-ink-500">{p.period_label} · {formatDate(p.created_at)}{p.reference ? ` · Ref ${p.reference}` : ""}</div>
                </div>
                <Badge tone={p.status === "paid" ? "go" : p.status === "failed" ? "stop" : "warn"}>{p.status}</Badge>
              </li>
            ))}
            {!payouts.length ? <li className="p-4 text-sm text-ink-500">No payouts yet.</li> : null}
          </ul>
        </Card>
      </div>
    </Container>
  );
}
