import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, Container, EmptyState, PageHeader, cn } from "@/components/ui";
import { BookingStatusPill } from "@/components/domain";
import { HostNav } from "../host-nav";
import { getDb } from "@/lib/db";
import { maybeSweep } from "@/lib/services/maintenance";
import { requireRolePage } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatDateTime, formatTime, localDateString, zonedParts } from "@/lib/domain/time";
import type { BookingStatus } from "@/lib/domain/booking-state";

export const metadata = { title: "Bookings & calendar" };

const TZ = "Asia/Kolkata";

export default async function HostBookingsPage({ searchParams }: PageProps<"/host/bookings">) {
  const viewer = await requireRolePage("host", "/host/bookings");
  const sp = await searchParams;
  const db = await getDb();
  await maybeSweep(db);
  const weekOffset = Number(sp.week ?? 0) || 0;
  const { rows } = await db.query<{ id: string; code: string; status: BookingStatus; start_at: Date; end_at: Date; amount_paise: number; host_share_paise: number; title: string; driver: string; listing_id: string }>(
    `select b.id, b.code, b.status, b.start_at, b.end_at, b.amount_paise, b.host_share_paise, l.title, split_part(p.full_name, ' ', 1) as driver, b.listing_id
       from public.bookings b join public.charger_listings l on l.id = b.listing_id join public.profiles p on p.id = b.driver_id
      where b.host_id = $1 order by b.start_at desc`,
    [viewer.userId],
  );
  const { rows: blocked } = await db.query<{ start_at: Date; end_at: Date; title: string }>(
    "select bt.start_at, bt.end_at, l.title from public.blocked_times bt join public.charger_listings l on l.id = bt.listing_id where l.host_id = $1",
    [viewer.userId],
  );
  const today = new Date(`${localDateString(new Date(), TZ)}T00:00:00+05:30`);
  const monday = new Date(today.getTime() - ((zonedParts(today, TZ).weekday + 6) % 7) * 86400_000 + weekOffset * 7 * 86400_000);
  const days = [...Array(7)].map((_, i) => new Date(monday.getTime() + i * 86400_000));
  const active = rows.filter((b) => !["declined", "expired", "cancelled"].includes(b.status));
  const requests = rows.filter((b) => b.status === "requested");
  const dayKey = (d: Date) => localDateString(d, TZ);
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader eyebrow="Host" title="Bookings & calendar" />
      <HostNav />
      {requests.length ? (
        <Card className="mb-6 p-4 text-sm"><strong>{requests.length} request{requests.length > 1 ? "s" : ""}</strong> waiting for your response. Open a request to accept or decline.</Card>
      ) : null}
      <Card className="mb-8 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-5 text-volt-600" aria-hidden /> Week of {formatDateTime(monday).split(",").slice(0, 2).join(",")}</h2>
          <div className="flex gap-1 text-sm">
            <Link href={`/host/bookings?week=${weekOffset - 1}`} className="rounded-lg px-3 py-1.5 hover:bg-ink-50">← Prev</Link>
            <Link href="/host/bookings" className="rounded-lg px-3 py-1.5 hover:bg-ink-50">Today</Link>
            <Link href={`/host/bookings?week=${weekOffset + 1}`} className="rounded-lg px-3 py-1.5 hover:bg-ink-50">Next →</Link>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-ink-100 sm:grid-cols-7 sm:divide-x sm:divide-y-0">
          {days.map((d) => {
            const k = dayKey(d);
            const items = active.filter((b) => dayKey(b.start_at) === k).sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));
            const blocks = blocked.filter((b) => dayKey(b.start_at) <= k && dayKey(new Date(new Date(b.end_at).getTime() - 1)) >= k);
            return (
              <div key={k} className={cn("min-h-28 p-2", k === dayKey(new Date()) && "bg-volt-50/50")}>
                <div className="mb-2 text-xs font-semibold text-ink-500">{new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric" }).format(d)}</div>
                <ul className="space-y-1.5">
                  {blocks.map((b, i) => <li key={`b${i}`} className="rounded-lg bg-ink-100 px-2 py-1 text-[11px] text-ink-500">Blocked · {b.title.slice(0, 18)}…</li>)}
                  {items.map((b) => (
                    <li key={b.id}>
                      <Link href={`/bookings/${b.id}`} className={cn("block rounded-lg px-2 py-1.5 text-[11px] leading-tight", b.status === "requested" ? "bg-warn-100 text-warn-600" : b.status === "completed" ? "bg-go-100 text-go-600" : b.status === "disputed" ? "bg-stop-100 text-stop-600" : "bg-ink-900 text-white")}>
                        <div className="font-semibold">{formatTime(b.start_at)}–{formatTime(b.end_at)}</div>
                        <div className="truncate opacity-80">{b.driver} · {b.code}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
      <h2 className="mb-3 text-lg font-semibold">All bookings</h2>
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-3">Booking</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Listing</th><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Your share</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((b) => (
                <tr key={b.id} className={cn(sp.b === b.id && "bg-volt-50")}>
                  <td className="px-4 py-3"><Link href={`/bookings/${b.id}`} className="font-semibold text-volt-700 hover:underline">{b.code}</Link></td>
                  <td className="px-4 py-3">{formatDateTime(b.start_at)}</td>
                  <td className="max-w-56 truncate px-4 py-3">{b.title}</td>
                  <td className="px-4 py-3">{b.driver}</td>
                  <td className="px-4 py-3"><BookingStatusPill status={b.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.host_share_paise, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<CalendarDays className="size-6" />} title="No bookings yet" body="Bookings for your live listings will show up here." />
      )}
    </Container>
  );
}
