import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, PlugZap } from "lucide-react";
import { Card, Container, EmptyState, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ListingPhoto, ListingStatusPill, Rating } from "@/components/domain";
import { HostNav } from "./host-nav";
import { getDb } from "@/lib/db";
import { maybeSweep } from "@/lib/services/maintenance";
import { emailDelivery } from "@/lib/email/delivery";
import { requireRolePage } from "@/lib/auth";
import { hostEarnings } from "@/lib/services/finance";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/domain/time";
import { CONNECTOR_SHORT } from "@/lib/labels";

export const metadata = { title: "Host dashboard" };

export default async function HostDashboard() {
  const viewer = await requireRolePage("host", "/host");
  const db = await getDb();
  await maybeSweep(db, emailDelivery());
  const { rows: hp } = await db.query<{ display_name: string }>("select display_name from public.host_profiles where user_id = $1", [viewer.userId]);
  if (!hp[0]) redirect("/host/onboarding");
  const [{ rows: listings }, { rows: requests }, { rows: upcoming }, earnings] = await Promise.all([
    db.query<{ id: string; title: string; status: string; locality: string; connector_type: string; rated_power_kw: number; property_type: string; price_per_hour_paise: number; review_count: number; avg_rating: number | null; photo_path: string | null }>(
      `select l.id, l.title, l.status, l.locality, l.connector_type, l.rated_power_kw, l.property_type, l.price_per_hour_paise,
              (select count(*)::int from public.reviews r where r.listing_id = l.id) as review_count,
              (select round(avg(rating)::numeric, 1) from public.reviews r where r.listing_id = l.id) as avg_rating,
              (select storage_path from public.charger_photos p where p.listing_id = l.id and p.kind = 'listing' order by sort_order limit 1) as photo_path
         from public.charger_listings l where l.host_id = $1 order by l.created_at`,
      [viewer.userId],
    ),
    db.query<{ id: string; code: string; start_at: Date; title: string }>(
      "select b.id, b.code, b.start_at, l.title from public.bookings b join public.charger_listings l on l.id = b.listing_id where b.host_id = $1 and b.status = 'requested' and b.hold_expires_at > now() order by b.start_at",
      [viewer.userId],
    ),
    db.query<{ id: string; code: string; start_at: Date; title: string; status: string }>(
      "select b.id, b.code, b.start_at, l.title, b.status from public.bookings b join public.charger_listings l on l.id = b.listing_id where b.host_id = $1 and b.status in ('confirmed','checked_in','in_progress') order by b.start_at limit 5",
      [viewer.userId],
    ),
    hostEarnings(db, viewer.userId),
  ]);
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader eyebrow="Host" title={`Welcome, ${hp[0].display_name}`} actions={<LinkButton href="/host/listings/new"><Plus className="size-4" aria-hidden /> New listing</LinkButton>} />
      <HostNav />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net earnings" value={formatINR(earnings.netEarningsPaise)} hint="Host share after commission & refunds" tone="go" />
        <Stat label="Available for payout" value={formatINR(earnings.availablePaise)} hint="From completed sessions" />
        <Stat label="Upcoming (pending)" value={formatINR(earnings.pendingPaise)} hint="Paid, session not yet completed" />
        <Stat label="Live listings" value={listings.filter((l) => l.status === "active").length} hint={`${listings.length} total`} />
      </div>

      {requests.length ? (
        <Card className="mt-6 border-warn-600/30 p-5">
          <h2 className="font-semibold">Booking requests waiting for you</h2>
          <ul className="mt-3 divide-y divide-ink-100">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/bookings/${r.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-volt-700">
                  <span><strong>{r.code}</strong> · {r.title} · {formatDateTime(r.start_at)}</span>
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Your listings</h2>
          {listings.length ? (
            <ul className="space-y-3">
              {listings.map((l) => (
                <li key={l.id}>
                  <Link href={`/host/listings/${l.id}`} className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-3 shadow-card hover:shadow-lift">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-ink-900"><ListingPhoto l={l} /></div>
                    <div className="min-w-0 flex-1">
                      <ListingStatusPill status={l.status} />
                      <div className="mt-1 truncate font-semibold">{l.title}</div>
                      <div className="text-sm text-ink-500">{l.locality} · {CONNECTOR_SHORT[l.connector_type]} {l.rated_power_kw} kW · {formatINR(l.price_per_hour_paise)}/hr</div>
                    </div>
                    <div className="hidden sm:block"><Rating avg={l.avg_rating} count={l.review_count} /></div>
                    <ChevronRight className="size-5 text-ink-300" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<PlugZap className="size-6" />} title="No listings yet" body="Create your first listing. It stays private until verification is complete." action={<LinkButton href="/host/listings/new">Create listing</LinkButton>} />
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Next sessions</h2>
          <Card className="divide-y divide-ink-100">
            {upcoming.length ? upcoming.map((b) => (
              <Link key={b.id} href={`/bookings/${b.id}`} className="block p-4 text-sm hover:bg-ink-50">
                <div className="font-semibold">{formatDateTime(b.start_at)}</div>
                <div className="text-ink-500">{b.code} · {b.title}</div>
              </Link>
            )) : <p className="p-4 text-sm text-ink-500">No upcoming sessions.</p>}
          </Card>
          <Link href="/host/bookings" className="mt-3 inline-block text-sm font-medium text-volt-700 hover:underline">Open calendar →</Link>
        </section>
      </div>
    </Container>
  );
}
