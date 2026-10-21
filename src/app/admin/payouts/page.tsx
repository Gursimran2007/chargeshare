import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { createPayoutAction, payoutStatusAction } from "../actions";
import { getDb } from "@/lib/db";
import { hostEarnings } from "@/lib/services/finance";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Admin · Payouts" };

export default async function AdminPayouts() {
  const db = await getDb();
  const { rows: hosts } = await db.query<{ user_id: string; display_name: string; payout_upi_masked: string | null }>("select user_id, display_name, payout_upi_masked from public.host_profiles order by display_name");
  const balances = await Promise.all(hosts.map(async (h) => ({ ...h, e: await hostEarnings(db, h.user_id) })));
  const { rows: payouts } = await db.query<{ id: string; amount_paise: number; status: string; period_label: string; reference: string | null; created_at: Date; host: string }>(
    "select p.*, h.display_name as host from public.payouts p join public.host_profiles h on h.user_id = p.host_id order by p.created_at desc",
  );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="mt-1 text-sm text-ink-500">Payouts are executed manually (bank/UPI transfer) and then recorded here with the transfer reference. Automated split settlements require payment-provider approval.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Host</th><th className="px-4 py-3 text-right">Net earned</th><th className="px-4 py-3 text-right">Pending</th><th className="px-4 py-3 text-right">Held</th><th className="px-4 py-3 text-right">Paid out</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {balances.map((h) => (
              <tr key={h.user_id}>
                <td className="px-4 py-3 font-medium">{h.display_name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(h.e.netEarningsPaise, { decimals: true })}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(h.e.pendingPaise, { decimals: true })}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(h.e.heldPaise, { decimals: true })}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(h.e.paidOutPaise + h.e.inFlightPayoutPaise, { decimals: true })}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(h.e.availablePaise, { decimals: true })}</td>
                <td className="px-4 py-3">
                  {h.e.availablePaise > 0 ? (
                    <ActionForm action={createPayoutAction} hidden={{ hostId: h.user_id }} submit="Create payout" variant="outline" confirm={{ title: `Pay out ${formatINR(h.e.availablePaise, { decimals: true })} to ${h.display_name}?`, body: "This reserves the available balance. Mark it paid after the transfer completes.", label: "Create payout" }}>
                      <Field label="Period label" htmlFor={`p-${h.user_id}`}><Input id={`p-${h.user_id}`} name="period" defaultValue={new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date())} /></Field>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Payout history</h2>
        <div className="grid gap-3">
          {payouts.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-semibold">{p.host} · {formatINR(p.amount_paise, { decimals: true })}</div>
                <div className="text-xs text-ink-500">{p.period_label} · created {formatDate(p.created_at)}{p.reference ? ` · ref ${p.reference}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={p.status === "paid" ? "go" : p.status === "failed" ? "stop" : "warn"}>{p.status}</Badge>
                {["pending", "processing"].includes(p.status) ? (
                  <ActionForm action={payoutStatusAction} hidden={{ payoutId: p.id }} submit="Update" variant="outline" className="flex flex-wrap items-end gap-2 space-y-0">
                    <Select name="status" aria-label="New status" className="h-9 w-36"><option value="paid">Mark paid</option><option value="processing">Processing</option><option value="failed">Failed</option></Select>
                    <Input name="reference" aria-label="Transfer reference" placeholder="UTR / reference" className="h-9 w-40" />
                  </ActionForm>
                ) : null}
              </div>
            </Card>
          ))}
          {!payouts.length ? <p className="text-sm text-ink-500">No payouts yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
