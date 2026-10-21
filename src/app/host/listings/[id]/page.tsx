import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff, Camera, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Container, Field, Input, PageHeader } from "@/components/ui";
import { ListingStatusPill, VerificationPill } from "@/components/domain";
import { HostNav } from "../../host-nav";
import { VerificationForm } from "../../verification-form";
import { ListingWizard } from "../listing-wizard";
import { blockTimeAction, deletePhotoAction, pauseAction, photoAction, submitReviewAction, unblockAction } from "../../actions";
import { getDb } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { CHECK_INFO, type CheckType } from "@/lib/services/verification";
import { formatDate, formatDateTime, localDateString } from "@/lib/domain/time";

export const metadata = { title: "Manage listing" };

const DETAIL_FIELDS: Record<string, { name: string; label: string; placeholder?: string }[]> = {
  property_permission: [{ name: "relationship", label: "Your relationship to the property", placeholder: "Owner / tenant / RWA office-bearer / manager" }],
  charger_spec: [
    { name: "serial_number", label: "Serial number (from rating plate)" },
    { name: "purchase_date", label: "Purchase date", placeholder: "YYYY-MM" },
  ],
  installation_evidence: [{ name: "installer", label: "Installer / company name" }, { name: "installed_on", label: "Installed on", placeholder: "YYYY-MM" }],
  electrical_safety: [{ name: "electrician", label: "Electrical contractor & licence no." }, { name: "inspected_on", label: "Inspection date", placeholder: "YYYY-MM-DD" }],
};

export default async function ManageListingPage({ params }: PageProps<"/host/listings/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const viewer = await requireRolePage("host", `/host/listings/${id}`);
  const db = await getDb();
  const { rows } = await db.query<Record<string, unknown> & { host_id: string; status: string; title: string; rejection_reason: string | null; suspended_reason: string | null; is_demo: boolean }>(
    "select * from public.charger_listings where id = $1",
    [id],
  );
  const l = rows[0];
  if (!l || l.host_id !== viewer.userId) notFound();
  const [{ rows: checks }, { rows: photos }, { rows: rules }, { rows: blocked }, { rows: connectors }] = await Promise.all([
    db.query<{ id: string; check_type: CheckType; status: string; decision_reason: string | null; is_simulated: boolean; submitted_at: Date | null; reviewed_at: Date | null; evidence_paths: string[] }>(
      `select id, check_type, status, decision_reason, is_simulated, submitted_at, reviewed_at, evidence_paths from public.charger_verifications
        where listing_id = $1 or (host_id = $2 and check_type = 'identity')
        order by array_position(array['identity','property_permission','charger_spec','installation_evidence','electrical_safety']::verification_check[], check_type)`,
      [id, viewer.userId],
    ),
    db.query<{ id: string; storage_path: string; kind: string }>("select id, storage_path, kind from public.charger_photos where listing_id = $1 order by sort_order", [id]),
    db.query<{ weekday: number; start: string; end: string }>(
      "select weekday, to_char(start_time, 'HH24:MI') as start, case when end_time = '23:59:59' then '24:00' else to_char(end_time, 'HH24:MI') end as end from public.availability_rules where listing_id = $1",
      [id],
    ),
    db.query<{ id: string; start_at: Date; end_at: Date; reason: string }>("select id, start_at, end_at, reason from public.blocked_times where listing_id = $1 and end_at > now() order by start_at", [id]),
    db.query<{ code: string; label: string; listable: boolean; max_kw: number; description: string }>("select code, label, listable, max_kw, description from public.connector_types order by sort_order"),
  ]);
  const initial = {
    title: l.title, description: l.description as string, propertyType: l.property_type as never, connectorType: l.connector_type as string,
    chargerMake: l.charger_make as string, chargerModel: l.charger_model as string, ratedPowerKw: Number(l.rated_power_kw), addressLine: l.address_line as string,
    locality: l.locality as string, city: l.city as string, pincode: (l.pincode as string) ?? "", lat: Number(l.lat), lng: Number(l.lng),
    accessType: l.access_type as never, parkingDetails: l.parking_details as string, accessInstructions: l.access_instructions as string,
    restrictions: l.restrictions as string, amenities: l.amenities as string[], supportedVehicleNotes: l.supported_vehicle_notes as string,
    pricePerHour: Number(l.price_per_hour_paise) / 100, bookingFee: Number(l.booking_fee_paise) / 100,
    minDurationMinutes: Number(l.min_duration_minutes), maxDurationMinutes: Number(l.max_duration_minutes), bufferMinutes: Number(l.buffer_minutes),
    advanceNoticeMinutes: Number(l.advance_notice_minutes), cancellationPolicy: l.cancellation_policy as never, instantBook: Boolean(l.instant_book),
    availability: rules.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end })),
  };
  const outstanding = checks.filter((c) => c.status === "not_submitted" || c.status === "needs_info").length;
  const canSubmit = ["draft", "changes_requested", "rejected"].includes(l.status);

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Listing <ListingStatusPill status={l.status} />{l.is_demo ? <Badge tone="warn">Demo</Badge> : null}</span>}
        title={l.title}
        actions={
          <>
            {l.status === "active" ? (
              <>
                <Link href={`/chargers/${id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold hover:bg-ink-50">
                  <ExternalLink className="size-4" aria-hidden /> View public page
                </Link>
                <ActionForm action={pauseAction} hidden={{ listingId: id, pause: "1" }} submit="Pause listing" variant="outline" confirm={{ title: "Pause this listing?", body: "It disappears from search. Existing bookings stay confirmed; cancel them separately if needed.", label: "Pause" }} />
              </>
            ) : null}
            {l.status === "paused" ? <ActionForm action={pauseAction} hidden={{ listingId: id, pause: "0" }} submit="Resume listing" variant="volt" /> : null}
            {canSubmit ? <ActionForm action={submitReviewAction} hidden={{ listingId: id }} submit="Submit for review" variant="volt" /> : null}
          </>
        }
      />
      <HostNav />
      {l.rejection_reason && ["rejected", "changes_requested"].includes(l.status) ? (
        <div className="mb-6 rounded-2xl border border-warn-600/20 bg-warn-100/60 p-4 text-sm"><strong>Reviewer note:</strong> {l.rejection_reason}</div>
      ) : null}
      {l.status === "suspended" ? (
        <div className="mb-6 rounded-2xl border border-stop-600/20 bg-stop-100 p-4 text-sm text-stop-600"><strong>Suspended:</strong> {l.suspended_reason ?? "Contact support."}</div>
      ) : null}
      {canSubmit && outstanding ? (
        <div className="mb-6 rounded-2xl border border-ink-100 bg-white p-4 text-sm">
          <strong>{outstanding} verification item{outstanding > 1 ? "s" : ""} still needed</strong> before you can submit this listing for review.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-volt-600" aria-hidden /> Verification checks</h2>
            <p className="mt-1 text-sm text-ink-500">Each check is reviewed separately by ChargeShare. You cannot approve your own checks. The listing goes live only when all five are verified.</p>
            <ul className="mt-4 space-y-3">
              {checks.map((c) => (
                <li key={c.id} className="rounded-2xl border border-ink-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{CHECK_INFO[c.check_type].title}</div>
                      <div className="text-sm text-ink-500">{CHECK_INFO[c.check_type].evidence}</div>
                    </div>
                    <VerificationPill status={c.status} simulated={c.is_simulated} />
                  </div>
                  <div className="mt-2 text-xs text-ink-400">
                    {c.submitted_at ? `Submitted ${formatDate(c.submitted_at)}` : "Not submitted"}
                    {c.reviewed_at ? ` · Decided ${formatDate(c.reviewed_at)}` : ""}
                    {c.evidence_paths.length ? ` · ${c.evidence_paths.length} file(s)` : ""}
                  </div>
                  {c.decision_reason && c.status !== "verified" ? <p className="mt-2 rounded-xl bg-warn-100/60 p-2.5 text-sm"><strong>Note:</strong> {c.decision_reason}</p> : null}
                  {c.check_type === "identity" && c.status !== "verified" ? (
                    <Link href="/host/onboarding" className="mt-2 inline-block text-sm font-medium text-volt-700 underline">Manage identity verification</Link>
                  ) : c.check_type !== "identity" && ["not_submitted", "needs_info", "rejected"].includes(c.status) ? (
                    <VerificationForm checkType={c.check_type} listingId={id} detailFields={DETAIL_FIELDS[c.check_type] ?? []} evidenceHint={CHECK_INFO[c.check_type].evidence} resubmit={c.status !== "not_submitted"} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Listing details</h2>
            {l.status === "suspended" ? <p className="text-sm text-ink-500">Editing is disabled while suspended.</p> : <ListingWizard connectors={connectors} initial={initial} listingId={id} />}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Camera className="size-5 text-volt-600" aria-hidden /> Photos</h2>
            <p className="mt-1 text-xs text-ink-500">Listing photos are public once live. Installation photos are only visible to ChargeShare reviewers.</p>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <li key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${p.storage_path}`} alt="" className="h-full w-full object-cover" />
                  {p.kind === "installation" ? <span className="absolute left-1 top-1 rounded bg-ink-900/80 px-1.5 text-[10px] text-white">Install</span> : null}
                  <div className="absolute bottom-1 right-1">
                    <ActionForm action={deletePhotoAction} hidden={{ photoId: p.id, listingId: id }} submit={<Trash2 className="size-3.5" aria-label="Remove photo" />} variant="secondary" />
                  </div>
                </li>
              ))}
            </ul>
            <ActionForm action={photoAction} hidden={{ listingId: id }} submit="Upload" variant="outline" resetOnSuccess className="mt-3">
              <select name="kind" aria-label="Photo type" className="h-9 w-full rounded-lg border border-ink-200 px-2 text-sm">
                <option value="listing">Listing photo (public)</option>
                <option value="installation">Installation photo (reviewers only)</option>
              </select>
              <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Choose photos" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
            </ActionForm>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarOff className="size-5 text-volt-600" aria-hidden /> Block dates & times</h2>
            <ul className="mt-3 space-y-2">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                  <span>{formatDateTime(b.start_at)} → {formatDateTime(b.end_at)}{b.reason ? ` · ${b.reason}` : ""}</span>
                  <ActionForm action={unblockAction} hidden={{ blockedId: b.id, listingId: id }} submit="Remove" variant="ghost" />
                </li>
              ))}
              {!blocked.length ? <li className="text-sm text-ink-500">No upcoming blocks.</li> : null}
            </ul>
            <ActionForm action={blockTimeAction} hidden={{ listingId: id }} submit="Block time" variant="outline" resetOnSuccess className="mt-4 grid grid-cols-2 gap-2">
              <Field label="From date" htmlFor="bdate"><Input id="bdate" name="date" type="date" min={localDateString(new Date(), "Asia/Kolkata")} required /></Field>
              <Field label="Time" htmlFor="bfrom"><Input id="bfrom" name="from" type="time" defaultValue="00:00" /></Field>
              <Field label="To date" htmlFor="bend"><Input id="bend" name="endDate" type="date" /></Field>
              <Field label="Time" htmlFor="bto"><Input id="bto" name="to" type="time" defaultValue="23:59" /></Field>
              <Field label="Reason (private)" htmlFor="breason" className="col-span-2"><Input id="breason" name="reason" placeholder="e.g. Maintenance" /></Field>
            </ActionForm>
          </Card>
        </div>
      </div>
    </Container>
  );
}
