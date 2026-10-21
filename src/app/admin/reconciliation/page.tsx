import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { reconcile } from "@/lib/services/reconciliation";

export const metadata = { title: "Admin · Reconciliation" };

export default async function ReconciliationPage() {
  const checks = await reconcile(await getDb());
  const failing = checks.filter((c) => !c.ok).length;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Financial reconciliation</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">
        Integrity checks across payments, the ledger, refunds, payouts and booking states, computed live from the database. They confirm internal consistency only; matching against the payment provider&apos;s settlement reports is a separate, manual step until settlement import exists.
      </p>
      <p className={`mt-4 text-sm font-semibold ${failing ? "text-stop-600" : "text-go-600"}`}>
        {failing ? `${failing} of ${checks.length} checks failing: investigate before paying out.` : `All ${checks.length} checks pass.`}
      </p>
      <div className="mt-4 space-y-3">
        {checks.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start gap-3">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-go-600" aria-label="Passing" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-stop-600" aria-label="Failing" />}
              <div className="min-w-0">
                <h2 className="font-semibold">{c.title}</h2>
                <p className="text-sm text-ink-500">{c.rule}</p>
                {!c.ok ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {c.offenders.map((o, i) => (
                      <li key={i} className="text-stop-600">
                        {o.bookingId ? <Link href={`/bookings/${o.bookingId}`} className="font-semibold underline">{o.label}</Link> : <strong>{o.label}</strong>}: {o.detail}
                      </li>
                    ))}
                    {c.count > c.offenders.length ? <li className="text-ink-500">…and {c.count - c.offenders.length} more</li> : null}
                  </ul>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
