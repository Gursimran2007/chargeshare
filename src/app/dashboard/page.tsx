import Link from "next/link";
import { CalendarX2, Car, ChevronRight } from "lucide-react";
import { Container, EmptyState, LinkButton, PageHeader, Card } from "@/components/ui";
import { BookingStatusPill, DemoBadge, ListingPhoto } from "@/components/domain";
import { getDb } from "@/lib/db";
import { maybeSweep } from "@/lib/services/maintenance";
import { requireViewer } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/domain/time";
import type { BookingStatus } from "@/lib/domain/booking-state";

export const metadata = { title: "My bookings" };

interface Row {
  id: string; code: string; status: BookingStatus; start_at: Date; end_at: Date; amount_paise: number; is_demo: boolean;
  listing_id: string; title: string; locality: string; property_type: string; rated_power_kw: number;
}

function BookingRow({ b }: { b: Row }) {
  return (
    <li>
      <Link href={b.status === "pending_payment" ? `/checkout/${b.id}` : `/bookings/${b.id}`} className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-3 shadow-card transition hover:shadow-lift sm:p-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-ink-900 sm:size-20">
          <ListingPhoto l={{ id: b.listing_id, title: b.title, photo_path: null, property_type: b.property_type, rated_power_kw: b.rated_power_kw }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusPill status={b.status} />
            {b.is_demo ? <DemoBadge className="hidden sm:inline-flex" /> : null}
          </div>
          <div className="mt-1 truncate font-semibold">{b.title}</div>
          <div className="text-sm text-ink-500">{formatDateTime(b.start_at)} – {formatTime(b.end_at)} · {b.locality}</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-semibold">{formatINR(b.amount_paise, { decimals: true })}</div>
          <div className="text-xs text-ink-500">{b.code}</div>
        </div>
        <ChevronRight className="size-5 text-ink-300" aria-hidden />
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const viewer = await requireViewer("/dashboard");
  const db = await getDb();
  await maybeSweep(db);
  const { rows } = await db.query<Row>(
    `select b.id, b.code, b.status, b.start_at, b.end_at, b.amount_paise, b.is_demo, b.listing_id,
            l.title, l.locality, l.property_type, l.rated_power_kw
       from public.bookings b join public.charger_listings l on l.id = b.listing_id
      where b.driver_id = $1 order by b.start_at desc`,
    [viewer.userId],
  );
  const { rows: veh } = await db.query<{ n: number }>("select count(*)::int as n from public.vehicles where owner_id = $1", [viewer.userId]);
  const now = new Date().getTime();
  const upcoming = rows.filter((b) => ["requested", "pending_payment", "confirmed", "checked_in", "in_progress"].includes(b.status) && new Date(b.end_at).getTime() > now - 3600_000).reverse();
  const past = rows.filter((b) => !upcoming.includes(b));
  const actionNeeded = upcoming.filter((b) => b.status === "pending_payment");
  return (
    <Container className="max-w-4xl py-8 sm:py-12">
      <PageHeader title={`Hi ${viewer.fullName.split(" ")[0] || "there"}`} subtitle="Your charging bookings" actions={<LinkButton href="/chargers">Find a charger</LinkButton>} />
      {veh[0].n === 0 ? (
        <Card className="mb-6 flex items-center gap-4 p-4">
          <Car className="size-6 text-volt-600" aria-hidden />
          <p className="flex-1 text-sm">Add your vehicle so we only show chargers that work with it.</p>
          <LinkButton href="/account" size="sm" variant="outline">Add vehicle</LinkButton>
        </Card>
      ) : null}
      {actionNeeded.length ? (
        <div className="mb-6 rounded-xl border border-warn-600/20 bg-warn-100/60 p-4 text-sm">
          <strong>{actionNeeded.length} booking{actionNeeded.length > 1 ? "s" : ""} awaiting payment.</strong> Unpaid holds are released automatically.
        </div>
      ) : null}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
        {upcoming.length ? (
          <ul className="space-y-3">{upcoming.map((b) => <BookingRow key={b.id} b={b} />)}</ul>
        ) : (
          <EmptyState icon={<CalendarX2 className="size-6" />} title="No upcoming bookings" body="When you reserve a charger it will appear here with directions and access details." action={<LinkButton href="/chargers" variant="outline">Explore chargers</LinkButton>} />
        )}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Past & cancelled</h2>
        {past.length ? <ul className="space-y-3">{past.map((b) => <BookingRow key={b.id} b={b} />)}</ul> : <p className="text-sm text-ink-500">Nothing here yet.</p>}
      </section>
    </Container>
  );
}
