import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, Clock, Flag, Gauge, Lock, MapPin, ParkingSquare, Plug, ShieldCheck, Timer, TriangleAlert } from "lucide-react";
import { Badge, Container } from "@/components/ui";
import { DemoBadge, ListingPhoto, Rating, TrustBadge, VerificationPill } from "@/components/domain";
import { BookingWidget } from "./booking-widget";
import { ApproxMap } from "./approx-map";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { getPublicListing } from "@/lib/services/listings";
import { CHECK_INFO, type CheckType } from "@/lib/services/verification";
import { POLICY_TEXT } from "@/lib/domain/cancellation";
import { ACCESS_LABEL, PROPERTY_LABEL } from "@/lib/labels";
import { formatDate, localDateString } from "@/lib/domain/time";
import { formatINR } from "@/lib/money";
import { config } from "@/lib/config";
import { visitorId } from "@/lib/request";
import { track } from "@/lib/services/analytics";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function generateMetadata({ params }: PageProps<"/chargers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const l = await getPublicListing(await getDb(), id);
  return { title: l ? `${l.title} · ${l.locality}` : "Charger" };
}

export default async function ChargerPage({ params }: PageProps<"/chargers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const l = await getPublicListing(db, id);
  if (!l) notFound();
  const viewer = await getViewer();
  await track(db, "listing_view", { visitorId: await visitorId(), userId: viewer?.userId, listingId: l.id, isDemo: config.demoMode || l.is_demo });
  const [{ rows: photos }, { rows: rules }, { rows: checks }, { rows: reviews }, { rows: connector }, vehicles] = await Promise.all([
    db.query<{ id: string; storage_path: string; caption: string }>(
      "select id, storage_path, caption from public.charger_photos where listing_id = $1 and kind = 'listing' order by sort_order",
      [id],
    ),
    db.query<{ weekday: number; start: string; end: string }>(
      "select weekday, to_char(start_time, 'HH24:MI') as start, case when end_time = '23:59:59' then '24:00' else to_char(end_time, 'HH24:MI') end as end from public.availability_rules where listing_id = $1 order by weekday, start_time",
      [id],
    ),
    db.query<{ check_type: CheckType; status: string; reviewed_at: Date | null; is_simulated: boolean }>(
      `select check_type, status, reviewed_at, is_simulated from public.charger_verifications
        where listing_id = $1 or (host_id = $2 and check_type = 'identity') order by array_position(array['identity','property_permission','charger_spec','installation_evidence','electrical_safety']::verification_check[], check_type)`,
      [id, l.host_id],
    ),
    db.query<{ id: string; rating: number; comment: string; host_reply: string | null; created_at: Date; author: string }>(
      `select r.id, r.rating, r.comment, r.host_reply, r.created_at, split_part(p.full_name, ' ', 1) as author
         from public.reviews r join public.profiles p on p.id = r.author_id
        where r.listing_id = $1 and not r.is_hidden order by r.created_at desc limit 20`,
      [id],
    ),
    db.query<{ label: string; description: string }>("select label, description from public.connector_types where code = $1", [l.connector_type]),
    viewer
      ? db.query<{ id: string; nickname: string; make: string; model: string }>(
          "select id, nickname, make, model from public.vehicles where owner_id = $1 order by is_default desc, created_at",
          [viewer.userId],
        )
      : Promise.resolve({ rows: [] as { id: string; nickname: string; make: string; model: string }[] }),
  ]);
  const policy = POLICY_TEXT[l.cancellation_policy];
  const byDay = DAYS.map((d, i) => ({ d, windows: rules.filter((r) => r.weekday === i).map((r) => `${r.start}–${r.end}`) }));

  return (
    <Container className="py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
        <Link href="/chargers" className="hover:text-ink-900">Chargers</Link> <span aria-hidden>/</span> {l.locality}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        {l.is_demo ? <DemoBadge /> : null}
        <Badge tone="volt">{connector[0]?.label}</Badge>
        <Badge>{PROPERTY_LABEL[l.property_type]}</Badge>
      </div>
      <h1 className="mt-3 text-2xl font-semibold sm:text-4xl">{l.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
        <Rating avg={l.avg_rating} count={l.review_count} />
        <span className="inline-flex items-center gap-1"><MapPin className="size-4" aria-hidden /> {l.locality}, {l.city} (approximate)</span>
        <TrustBadge isDemo={l.is_demo} />
      </div>

      <div className="mt-6 grid gap-2 overflow-hidden rounded-2xl sm:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[16/10] bg-ink-900 sm:aspect-auto sm:h-[420px]">
          <ListingPhoto l={{ id: l.id, title: l.title, photo_path: photos[0]?.storage_path ?? null, property_type: l.property_type, rated_power_kw: l.rated_power_kw }} />
        </div>
        <div className={`hidden gap-2 sm:grid ${photos[1] ? "grid-rows-2" : ""}`}>
          {photos[1] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${photos[1].storage_path}`} alt={photos[1].caption || l.title} className="h-full w-full object-cover" />
          ) : null}
          <div className="relative min-h-48 bg-ink-100">
            <ApproxMap lat={l.approx_lat} lng={l.approx_lng} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          <section>
            <div className="flex items-center justify-between gap-4 border-b border-ink-100 pb-6">
              <div>
                <h2 className="text-lg font-semibold">Hosted by {l.host_display_name}</h2>
                <p className="text-sm text-ink-500">{PROPERTY_LABEL[l.host_type]} host</p>
              </div>
              <div className="grid size-12 place-items-center rounded-xl bg-ink-900 font-display text-lg font-semibold text-volt-300">
                {l.host_display_name[0]}
              </div>
            </div>
            {l.description ? <p className="mt-6 whitespace-pre-line leading-relaxed text-ink-700">{l.description}</p> : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Charger</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Plug, k: "Connector", v: connector[0]?.label },
                { icon: Gauge, k: "Rated power", v: `${l.rated_power_kw} kW ${l.current}` },
                { icon: ShieldCheck, k: "Make & model", v: `${l.charger_make} ${l.charger_model}` },
                { icon: Timer, k: "Bookings", v: `${l.min_duration_minutes / 60}–${l.max_duration_minutes / 60} h, ${l.buffer_minutes} min buffer` },
              ].map((x) => (
                <div key={x.k} className="flex gap-3 rounded-xl border border-ink-100 bg-white p-4">
                  <x.icon className="mt-0.5 size-5 shrink-0 text-volt-600" aria-hidden />
                  <div><dt className="text-xs text-ink-500">{x.k}</dt><dd className="font-medium">{x.v}</dd></div>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-ink-500">{connector[0]?.description}</p>
            {l.supported_vehicle_notes ? <p className="mt-2 text-sm text-ink-600"><Car className="mr-1 inline size-4" aria-hidden />{l.supported_vehicle_notes}</p> : null}
            <p className="mt-3 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
              Specifications are checked manually against documents the host provides. ChargeShare does not show live charger status, meter energy or control the charger remotely.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Parking & access</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-3"><ParkingSquare className="size-5 shrink-0 text-ink-500" aria-hidden /><span><strong>{ACCESS_LABEL[l.access_type]}.</strong> {l.parking_details}</span></li>
              {l.restrictions ? <li className="flex gap-3"><TriangleAlert className="size-5 shrink-0 text-warn-600" aria-hidden /><span>{l.restrictions}</span></li> : null}
              <li className="flex gap-3"><Lock className="size-5 shrink-0 text-ink-500" aria-hidden /><span>The exact address and access instructions are shared once your booking is confirmed.</span></li>
            </ul>
            {l.amenities.length ? (
              <div className="mt-4 flex flex-wrap gap-2">{l.amenities.map((a) => <Badge key={a} tone="outline">{a}</Badge>)}</div>
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Charging hours</h2>
            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {byDay.map((d) => (
                <li key={d.d} className="rounded-xl border border-ink-100 bg-white p-3">
                  <div className="font-medium">{d.d}</div>
                  <div className="text-ink-500">{d.windows.length ? d.windows.join(", ") : "Closed"}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1 text-xs text-ink-500"><Clock className="size-3.5" aria-hidden /> Times are India Standard Time.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Verification</h2>
            {l.is_demo ? (
              <p className="mt-2 rounded-xl border border-warn-600/20 bg-warn-100/60 p-3 text-sm text-ink-700">
                This is a fictional demo listing. The check results below are simulated to demonstrate the workflow and do not represent a real inspection.
              </p>
            ) : null}
            <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
              {checks.map((c) => (
                <li key={c.check_type} className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">{CHECK_INFO[c.check_type].title}</div>
                    <div className="text-sm text-ink-500">{CHECK_INFO[c.check_type].what}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <VerificationPill status={c.status} simulated={c.is_simulated} />
                    {c.reviewed_at ? <div className="mt-1 text-xs text-ink-400">{formatDate(c.reviewed_at)}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Cancellation: {policy.title}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-700">
              {policy.rules.map((r) => <li key={r}>{r}</li>)}
              <li>If the host cancels, you get a full refund.</li>
            </ul>
            <Link href="/legal/cancellation" className="mt-2 inline-block text-sm font-medium text-volt-700 underline">Full cancellation policy</Link>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Reviews</h2>
            {reviews.length ? (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-xl border border-ink-100 bg-white p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{r.author || "Driver"}</span>
                      <span className="text-ink-500">{"★".repeat(r.rating)}<span className="text-ink-200">{"★".repeat(5 - r.rating)}</span> · {formatDate(r.created_at)}</span>
                    </div>
                    {r.comment ? <p className="mt-2 text-sm text-ink-700">{r.comment}</p> : null}
                    {r.host_reply ? <p className="mt-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-600"><strong>Host reply:</strong> {r.host_reply}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No reviews yet. Reviews can only be left by drivers after a completed session.</p>
            )}
          </section>

          <div className="flex justify-between border-t border-ink-100 pt-6 text-sm">
            <span className="text-ink-500">Pricing: {formatINR(l.price_per_hour_paise)}/hr{l.booking_fee_paise ? ` + ${formatINR(l.booking_fee_paise)} booking fee` : ""}. No other charges.</span>
            <Link href={`/support/report?type=listing&id=${l.id}`} className="inline-flex items-center gap-1 font-medium text-ink-600 hover:text-stop-600">
              <Flag className="size-4" aria-hidden /> Report listing
            </Link>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingWidget
            listingId={l.id}
            pricePerHourPaise={l.price_per_hour_paise}
            bookingFeePaise={l.booking_fee_paise}
            minMinutes={l.min_duration_minutes}
            maxMinutes={l.max_duration_minutes}
            instantBook={l.instant_book}
            vehicles={vehicles.rows.map((v) => ({ id: v.id, label: v.nickname ? `${v.nickname} · ${v.make} ${v.model}` : `${v.make} ${v.model}` }))}
            signedIn={!!viewer}
            isOwnListing={viewer?.userId === l.host_id}
            today={localDateString(new Date(), "Asia/Kolkata")}
          />
        </aside>
      </div>
    </Container>
  );
}
