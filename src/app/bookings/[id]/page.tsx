import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Flag, KeyRound, Lock, MapPin, MessageSquare, Navigation, Receipt } from "lucide-react";
import { Badge, Card, Container, LinkButton } from "@/components/ui";
import { BookingStatusPill, DemoBadge } from "@/components/domain";
import { CancelButton, CheckInButton, DisputeButton, HostRespond, HostSession, MessageForm, ReviewForm } from "./booking-panels";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/domain/time";
import { POLICY_TEXT, refundForCancellation, type CancellationPolicy } from "@/lib/domain/cancellation";
import { STATUS_LABEL, type BookingStatus } from "@/lib/domain/booking-state";
import { CONNECTOR_SHORT } from "@/lib/labels";

export const metadata = { title: "Booking" };

const RELEASED: BookingStatus[] = ["confirmed", "checked_in", "in_progress", "completed", "disputed"];

export default async function BookingPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer(`/bookings/${id}`);
  const db = await getDb();
  const { rows } = await db.query<{
    id: string; code: string; status: BookingStatus; driver_id: string; host_id: string; listing_id: string;
    start_at: Date; end_at: Date; duration_minutes: number; price_per_hour_paise: number; booking_fee_paise: number;
    amount_paise: number; commission_paise: number; host_share_paise: number; cancellation_policy: CancellationPolicy;
    driver_note: string; hold_expires_at: Date | null; completed_at: Date | null; is_demo: boolean; estimate: { estimate?: { energyKwh: number } | null };
    title: string; locality: string; address_line: string; lat: number; lng: number; access_instructions: string;
    connector_type: string; rated_power_kw: number; parking_details: string; host_name: string; driver_name: string;
    vehicle: string | null;
  }>(
    `select b.*, l.title, l.locality, l.address_line, l.lat, l.lng, l.access_instructions, l.connector_type, l.rated_power_kw,
            l.parking_details, h.display_name as host_name, split_part(dp.full_name, ' ', 1) as driver_name,
            (select concat_ws(' ', v.make, v.model) from public.vehicles v where v.id = b.vehicle_id) as vehicle
       from public.bookings b
       join public.charger_listings l on l.id = b.listing_id
       join public.host_profiles h on h.user_id = b.host_id
       join public.profiles dp on dp.id = b.driver_id
      where b.id = $1`,
    [id],
  );
  const b = rows[0];
  const isAdmin = viewer.roles.includes("admin");
  const role = b?.driver_id === viewer.userId ? "driver" : b?.host_id === viewer.userId ? "host" : isAdmin ? "admin" : null;
  if (!b || !role) notFound(); // never reveal other users' bookings

  const [{ rows: events }, { rows: messages }, { rows: refunds }, { rows: review }, { rows: payment }] = await Promise.all([
    db.query<{ to_status: BookingStatus; actor_role: string; note: string | null; created_at: Date }>(
      "select to_status, actor_role, note, created_at from public.booking_events where booking_id = $1 order by created_at, id",
      [id],
    ),
    db.query<{ id: string; sender_id: string; body: string; created_at: Date }>(
      "select id, sender_id, body, created_at from public.messages where booking_id = $1 order by created_at",
      [id],
    ),
    db.query<{ amount_paise: number; status: string; reason: string; created_at: Date }>(
      "select amount_paise, status, reason, created_at from public.refunds where booking_id = $1 order by created_at",
      [id],
    ),
    db.query<{ rating: number; comment: string }>("select rating, comment from public.reviews where booking_id = $1", [id]),
    db.query<{ provider: string; status: string; provider_payment_id: string | null }>(
      "select provider, status, provider_payment_id from public.payments where booking_id = $1 order by created_at desc limit 1",
      [id],
    ),
  ]);
  const showPrivate = role !== "driver" || RELEASED.includes(b.status);
  const now = new Date();
  const refundPreview = ["confirmed"].includes(b.status)
    ? refundForCancellation(b.cancellation_policy, b.amount_paise, new Date(b.start_at), now, role === "driver" ? "driver" : role)
    : null;
  const canCheckIn = role === "driver" && b.status === "confirmed" && now.getTime() >= new Date(b.start_at).getTime() - 30 * 60000 && now < new Date(b.end_at);
  const canHostStart = role !== "driver" && ["confirmed", "checked_in"].includes(b.status) && now.getTime() >= new Date(b.start_at).getTime() - 30 * 60000;
  const canHostComplete = role !== "driver" && ["in_progress", "checked_in"].includes(b.status);
  const canDispute =
    (role === "driver" || role === "host") &&
    (["confirmed", "checked_in", "in_progress"].includes(b.status) ||
      (b.status === "completed" && b.completed_at && now.getTime() - new Date(b.completed_at).getTime() < 72 * 3_600_000));
  const back = role === "host" ? "/host/bookings" : role === "admin" ? "/admin/bookings" : "/dashboard";

  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <Link href={back} className="text-sm text-ink-500 hover:text-ink-900">← Back</Link>
      {sp.confirmed && b.status === "confirmed" ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-go-600/20 bg-go-100 p-4">
          <CheckCircle2 className="mt-0.5 size-5 text-go-600" aria-hidden />
          <div>
            <div className="font-semibold text-go-600">Booking confirmed</div>
            <p className="text-sm text-ink-700">
              {payment[0]?.provider === "demo" ? "Simulated payment verified (demo, no money moved). " : "Payment verified. "}
              The exact address and access instructions are below.
            </p>
          </div>
        </div>
      ) : null}
      {sp.requested && b.status === "requested" ? (
        <div className="mt-4 rounded-2xl border border-warn-600/20 bg-warn-100/60 p-4 text-sm text-ink-700">
          <strong>Request sent.</strong> The host will accept or decline. You will only be asked to pay once they accept.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">{b.title}</h1>
        <BookingStatusPill status={b.status} />
        {b.is_demo ? <DemoBadge /> : null}
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Booking {b.code} · {role === "driver" ? `Hosted by ${b.host_name}` : `Driver: ${b.driver_name}${b.vehicle ? ` · ${b.vehicle}` : ""}`}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-ink-500">Date & time</div><div className="font-medium">{formatDateTime(b.start_at)} – {formatTime(b.end_at)}</div></div>
              <div><div className="text-xs text-ink-500">Charger</div><div className="font-medium">{CONNECTOR_SHORT[b.connector_type]} · {b.rated_power_kw} kW</div></div>
              <div><div className="text-xs text-ink-500">Area</div><div className="font-medium">{b.locality}</div></div>
            </div>
            {b.driver_note ? <p className="mt-4 rounded-xl bg-ink-50 p-3 text-sm"><strong>Driver note:</strong> {b.driver_note}</p> : null}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-volt-600" aria-hidden /> Address & access</h2>
            {showPrivate ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="flex gap-2"><MapPin className="size-4 shrink-0 text-ink-500" aria-hidden /> {b.address_line}, {b.locality}</p>
                <p className="whitespace-pre-line rounded-xl bg-volt-50 p-3 text-ink-800">{b.access_instructions}</p>
                <p className="text-ink-600">{b.parking_details}</p>
                <a
                  className="inline-flex items-center gap-1.5 font-semibold text-volt-700 underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="size-4" aria-hidden /> Directions
                </a>
              </div>
            ) : (
              <p className="mt-3 flex gap-2 text-sm text-ink-600">
                <Lock className="size-4 shrink-0" aria-hidden /> Shared once the booking is confirmed and paid.
              </p>
            )}
          </Card>

          {!["declined", "expired"].includes(b.status) && role !== "admin" ? (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-volt-600" aria-hidden /> Messages</h2>
              <p className="mt-1 text-xs text-ink-500">Keep contact on ChargeShare. Phone numbers and emails are hidden automatically.</p>
              <ul className="mt-4 space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_id === viewer.userId;
                  return (
                    <li key={m.id} className={`flex ${mine ? "justify-end" : ""}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-900"}`}>
                        <p className="whitespace-pre-line">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-ink-300" : "text-ink-500"}`}>{formatDateTime(m.created_at)}</p>
                      </div>
                    </li>
                  );
                })}
                {!messages.length ? <li className="text-sm text-ink-500">No messages yet.</li> : null}
              </ul>
              <div className="mt-4"><MessageForm bookingId={b.id} /></div>
            </Card>
          ) : null}

          {role === "driver" && b.status === "completed" ? (
            <Card className="p-5">
              <h2 className="font-semibold">Your review</h2>
              {review[0] ? (
                <p className="mt-2 text-sm">{"★".repeat(review[0].rating)} {review[0].comment}</p>
              ) : (
                <div className="mt-3"><ReviewForm bookingId={b.id} /></div>
              )}
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-volt-600" aria-hidden /> Timeline</h2>
            <ol className="mt-4 space-y-3 border-l border-ink-100 pl-4">
              {events.map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-volt-500 ring-4 ring-white" />
                  <div className="font-medium">{STATUS_LABEL[e.to_status]} <span className="font-normal text-ink-500">by {e.actor_role}</span></div>
                  <div className="text-xs text-ink-500">{formatDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</div>
                </li>
              ))}
            </ol>
            {["completed", "in_progress"].includes(b.status) ? (
              <p className="mt-4 text-xs text-ink-500">Session start and completion are confirmed manually by the host. ChargeShare does not meter energy.</p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Receipt className="size-4 text-volt-600" aria-hidden /> Payment</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">{formatINR(b.price_per_hour_paise)}/hr × {b.duration_minutes / 60} h</dt><dd>{formatINR(b.amount_paise - b.booking_fee_paise, { decimals: true })}</dd></div>
              {b.booking_fee_paise ? <div className="flex justify-between"><dt className="text-ink-500">Booking fee</dt><dd>{formatINR(b.booking_fee_paise)}</dd></div> : null}
              <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold"><dt>Total</dt><dd>{formatINR(b.amount_paise, { decimals: true })}</dd></div>
              {role !== "driver" ? (
                <>
                  <div className="flex justify-between text-ink-500"><dt>Platform commission</dt><dd>−{formatINR(b.commission_paise, { decimals: true })}</dd></div>
                  <div className="flex justify-between font-medium"><dt>Host share</dt><dd>{formatINR(b.host_share_paise, { decimals: true })}</dd></div>
                </>
              ) : null}
            </dl>
            {payment[0] ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
                <Badge tone={payment[0].status === "captured" ? "go" : payment[0].status === "failed" ? "stop" : "neutral"}>{payment[0].status.replace("_", " ")}</Badge>
                {payment[0].provider === "demo" ? <Badge tone="warn">DEMO · simulated</Badge> : <span>via Razorpay</span>}
              </div>
            ) : null}
            {refunds.map((r, i) => (
              <div key={i} className="mt-3 rounded-xl bg-ink-50 p-3 text-xs">
                <div className="flex justify-between font-semibold"><span>Refund ({r.status})</span><span>{formatINR(r.amount_paise, { decimals: true })}</span></div>
                <div className="mt-0.5 text-ink-500">{r.reason}</div>
              </div>
            ))}
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Actions</h2>
            {role === "driver" && b.status === "pending_payment" ? <LinkButton href={`/checkout/${b.id}`} variant="volt" className="w-full">Pay now</LinkButton> : null}
            {canCheckIn ? <CheckInButton bookingId={b.id} /> : null}
            {role === "host" && b.status === "requested" ? <HostRespond bookingId={b.id} /> : null}
            {canHostStart ? <HostSession bookingId={b.id} step="start" /> : null}
            {canHostComplete ? <HostSession bookingId={b.id} step="complete" /> : null}
            {["requested", "pending_payment", "confirmed"].includes(b.status) || (b.status === "checked_in" && role !== "driver") ? (
              <CancelButton
                bookingId={b.id}
                refundText={
                  refundPreview
                    ? `${refundPreview.rule}. You will be refunded ${formatINR(refundPreview.refundPaise, { decimals: true })} of ${formatINR(b.amount_paise, { decimals: true })}.`
                    : role === "driver"
                      ? "You have not been charged for this booking."
                      : "The driver will be refunded in full and notified."
                }
              />
            ) : null}
            {canDispute ? <DisputeButton bookingId={b.id} /> : null}
            <Link href={`/support/report?type=booking&id=${b.id}`} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-stop-600">
              <Flag className="size-4" aria-hidden /> Report a safety issue
            </Link>
            <p className="border-t border-ink-100 pt-3 text-xs text-ink-500">
              {POLICY_TEXT[b.cancellation_policy].title} policy: {POLICY_TEXT[b.cancellation_policy].summary}
            </p>
          </Card>
        </div>
      </div>
    </Container>
  );
}
