import { Badge, Card, Stat } from "@/components/ui";
import { getDb } from "@/lib/db";
import { platformMetrics } from "@/lib/services/finance";
import { reconcile } from "@/lib/services/reconciliation";
import Link from "next/link";
import { formatINR } from "@/lib/money";
import { config } from "@/lib/config";

export const metadata = { title: "Admin · Analytics" };

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function AdminAnalytics() {
  const db = await getDb();
  const m = await platformMetrics(db);
  const failingChecks = (await reconcile(db)).filter((c) => !c.ok).length;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Platform analytics</h1>
        {config.demoMode || m.demoShare.bookings ? (
          <Badge tone="warn">Demo data: {m.demoShare.bookings} of {m.bookingRequests} bookings and {m.demoShare.listings} listings are seeded</Badge>
        ) : null}
      </div>
      <Link
        href="/admin/reconciliation"
        className={`block rounded-xl border p-3 text-sm font-medium ${failingChecks ? "border-stop-600/30 bg-stop-100 text-stop-600" : "border-go-600/20 bg-go-100 text-go-600"}`}
      >
        {failingChecks ? `Reconciliation: ${failingChecks} check(s) failing. Review before paying out →` : "Reconciliation: all ledger, refund and payout checks pass →"}
      </Link>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Supply & demand</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Registered drivers" value={m.drivers} />
          <Stat label="Registered hosts" value={m.hosts} />
          <Stat label="Listings submitted / approved" value={`${m.listingsSubmitted} / ${m.listingsApproved}`} />
          <Stat label="Active listings" value={m.listingsActive} />
          <Stat label="Booking requests" value={m.bookingRequests} />
          <Stat label="Completed sessions" value={m.completedSessions} />
          <Stat label="Booking conversion" value={pct(m.conversionRate)} hint="Paid bookings ÷ booking requests" />
          <Stat label="Repeat booking rate" value={pct(m.repeatRate)} hint="Drivers with 2+ paid bookings ÷ drivers with 1+" />
          <Stat label="Cancellation rate" value={pct(m.cancellationRate)} />
          <Stat label="Refund rate" value={pct(m.refundRate)} hint="Refunded ÷ gross booking value" />
          <Stat label="Charger utilisation" value={pct(m.utilisation)} hint={m.utilisationNote} />
          <Stat label="Booking completion rate" value={pct(m.bookingCompletionRate)} hint="Completed ÷ confirmed bookings whose slot has ended (excl. cancellations)" />
          <Stat label="Host-caused cancellations" value={pct(m.hostCancellationRate)} hint="Cancelled by host ÷ bookings that were confirmed" />
          <Stat label="Host response time (median)" value={m.hostResponseMedianMinutes === null ? "—" : `${m.hostResponseMedianMinutes} min`} hint="Request created → host accepts or declines" />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Funnel · last 30 days, distinct visitors</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Searched" value={m.funnel.searchVisitors} />
          <Stat label="Viewed a listing" value={m.funnel.listingVisitors} hint={`Search → listing: ${pct(m.funnel.searchToListing)}`} />
          <Stat label="Requested a booking" value={m.funnel.bookingVisitors} hint={`Listing → booking: ${pct(m.funnel.listingToBooking)}`} />
          <Stat label="Searches with no results" value={pct(m.zeroResultSearchRate)} hint="Unmet demand: where to recruit hosts" />
          <Stat label="Repeat rate, last 30 days" value={pct(m.repeatRate30d)} hint="Drivers with 2+ paid bookings ÷ drivers with 1+, created in the window" />
          <Stat label="Chargebacks" value="Not tracked" hint="Needs Razorpay dispute webhooks (payment.dispute.*)" />
        </div>
        <p className="mt-2 text-xs text-ink-500">Seeded bookings were created directly, so they are not in the funnel. CAC and host acquisition cost need real marketing spend data and are not shown.</p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Money (kept separate on purpose)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Gross booking value" value={formatINR(m.gbvPaise)} hint="Total paid by drivers" />
          <Stat label="Platform commission" value={formatINR(m.commissionPaise)} hint="Gross, net of refund reversals" tone="volt" />
          <Stat label="Net contribution (est.)" value={formatINR(m.netContributionPaise)} hint="Commission − est. GST − est. gateway fees" />
          <Stat label="Refunds" value={formatINR(m.refundsPaise)} />
          <Stat label="Est. GST on commission" value={formatINR(m.taxEstimatePaise)} hint="Estimate; confirm with a CA" />
          <Stat label="Est. gateway fees" value={formatINR(m.processingFeeEstimatePaise)} hint="Replace with settlement data" />
          <Stat label="Host payout liability" value={formatINR(m.payoutLiabilityPaise)} hint="Host share owed minus paid out" tone="warn" />
        </div>
        <Card className="mt-4 p-4 text-sm text-ink-600">
          Commission is not profit. Net contribution here deducts only estimated GST and payment fees; it excludes refunds absorbed by the platform, support costs, insurance and marketing.
        </Card>
      </section>
    </div>
  );
}
