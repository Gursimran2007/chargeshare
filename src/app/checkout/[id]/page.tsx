import { notFound, redirect } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import { Card, Container, PageHeader } from "@/components/ui";
import { DemoBadge, ListingPhoto } from "@/components/domain";
import { PayPanel } from "./pay-panel";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { currentPaymentMode } from "@/lib/payments";
import { visitorId } from "@/lib/request";
import { track } from "@/lib/services/analytics";
import { formatINR } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/domain/time";
import { POLICY_TEXT, type CancellationPolicy } from "@/lib/domain/cancellation";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: PageProps<"/checkout/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireViewer(`/checkout/${id}`);
  const db = await getDb();
  const { rows } = await db.query<{
    id: string; code: string; driver_id: string; status: string; start_at: Date; end_at: Date; duration_minutes: number;
    price_per_hour_paise: number; booking_fee_paise: number; amount_paise: number; hold_expires_at: Date | null;
    cancellation_policy: CancellationPolicy; title: string; locality: string; listing_id: string; property_type: string;
    rated_power_kw: number; is_demo: boolean;
  }>(
    `select b.*, l.title, l.locality, l.property_type, l.rated_power_kw from public.bookings b
       join public.charger_listings l on l.id = b.listing_id where b.id = $1`,
    [id],
  );
  const b = rows[0];
  if (!b || b.driver_id !== viewer.userId) notFound();
  if (b.status !== "pending_payment") redirect(`/bookings/${id}`);
  await track(db, "checkout_view", { visitorId: await visitorId(), userId: viewer.userId, listingId: b.listing_id, bookingId: b.id, isDemo: b.is_demo });
  const policy = POLICY_TEXT[b.cancellation_policy];
  const mode = currentPaymentMode();
  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <PageHeader eyebrow={`Booking ${b.code}`} title="Confirm and pay" subtitle="Your booking is confirmed only after payment is verified by our server." />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="overflow-hidden">
          <div className="flex gap-4 p-5">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-ink-900">
              <ListingPhoto l={{ id: b.listing_id, title: b.title, photo_path: null, property_type: b.property_type, rated_power_kw: b.rated_power_kw }} />
            </div>
            <div>
              {b.is_demo ? <DemoBadge /> : null}
              <h2 className="mt-1 font-semibold">{b.title}</h2>
              <p className="flex items-center gap-1 text-sm text-ink-500"><MapPin className="size-3.5" aria-hidden /> {b.locality}</p>
            </div>
          </div>
          <dl className="space-y-3 border-t border-ink-100 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">When</dt><dd className="text-right font-medium">{formatDateTime(b.start_at)} – {formatTime(b.end_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Charging time</dt><dd>{formatINR(b.price_per_hour_paise)}/hr × {b.duration_minutes / 60} h</dd></div>
            {b.booking_fee_paise ? <div className="flex justify-between"><dt className="text-ink-500">Booking fee</dt><dd>{formatINR(b.booking_fee_paise)}</dd></div> : null}
            <div className="flex justify-between border-t border-ink-100 pt-3 text-base font-semibold"><dt>Total (INR)</dt><dd>{formatINR(b.amount_paise, { decimals: true })}</dd></div>
          </dl>
          <div className="border-t border-ink-100 bg-ink-50/50 p-5 text-sm">
            <div className="font-semibold">Cancellation: {policy.title}</div>
            <ul className="mt-1 list-disc pl-5 text-ink-600">{policy.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            {mode.ok ? (
              <PayPanel
                bookingId={b.id}
                amountPaise={b.amount_paise}
                holdUntil={b.hold_expires_at ? new Date(b.hold_expires_at).toISOString() : null}
                provider={mode.provider}
                prefill={{ name: viewer.fullName, email: viewer.email }}
              />
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-stop-600">Payments are not available right now</p>
                <p className="text-ink-600">You have not been charged. Your slot stays held until the time shown on your booking; please try again later or contact support.</p>
              </div>
            )}
          </Card>
          <p className="flex gap-2 text-xs text-ink-500">
            <ShieldCheck className="size-4 shrink-0 text-go-600" aria-hidden />
            The price was calculated on our server from the host&apos;s listed rates. It cannot be changed from your browser.
          </p>
        </div>
      </div>
    </Container>
  );
}
