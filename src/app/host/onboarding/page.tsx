import { CheckCircle2, ClipboardCheck, UserRound } from "lucide-react";
import { ActionForm, FormField } from "@/components/action-form";
import { Card, Container, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { VerificationPill } from "@/components/domain";
import { HostNav } from "../host-nav";
import { VerificationForm } from "../verification-form";
import { hostProfileAction, safetyChecklistAction } from "../actions";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { CHECK_INFO } from "@/lib/services/verification";
import { PROPERTY_LABEL } from "@/lib/labels";

export const metadata = { title: "Host onboarding" };

const SAFETY_ITEMS = [
  ["electrician_inspection", "A licensed electrical contractor has inspected the charger installation (earthing, cable rating, RCD/RCBO protection) within the last 12 months."],
  ["dedicated_circuit", "The charger is a fixed EVSE on its own dedicated circuit with an isolator, not a plug-in socket or extension lead."],
  ["rcd_protection", "Appropriate residual current protection is installed for the charger circuit."],
  ["property_permission", "I own the parking space or have written permission (lease, RWA or property-manager NOC) to let visitors use it."],
  ["insurance", "I have checked my property / liability insurance covers visitors using the charger, or I am arranging cover."],
  ["incident_plan", "I know how to isolate the charger in an emergency, and will report any incident to ChargeShare immediately."],
  ["no_domestic_socket", "I will not offer an ordinary household socket for charging through ChargeShare."],
] as const;

export default async function HostOnboardingPage() {
  const viewer = await requireViewer("/host/onboarding");
  const db = await getDb();
  const { rows: hp } = await db.query<{ host_type: string; display_name: string; bio: string; contact_phone: string | null; safety_checklist: Record<string, boolean> }>(
    "select host_type, display_name, bio, contact_phone, safety_checklist from public.host_profiles where user_id = $1",
    [viewer.userId],
  );
  const host = hp[0];
  const { rows: idv } = await db.query<{ status: string; decision_reason: string | null; is_simulated: boolean }>(
    "select status, decision_reason, is_simulated from public.charger_verifications where host_id = $1 and check_type = 'identity'",
    [viewer.userId],
  );
  const identity = idv[0];
  const checklist = host?.safety_checklist ?? {};
  const checklistDone = SAFETY_ITEMS.every(([k]) => checklist[k]);

  return (
    <Container className="max-w-4xl py-8 sm:py-12">
      <PageHeader eyebrow="Host" title={host ? "Profile & safety" : "Become a ChargeShare host"} subtitle="Three steps before your first listing: your host profile, identity verification and the safety checklist." />
      {host ? <HostNav /> : null}
      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-full bg-ink-900 text-xs text-white">1</span> Host profile
            {host ? <CheckCircle2 className="size-4 text-go-600" aria-label="Done" /> : null}
          </h2>
          <ActionForm action={hostProfileAction} submit={host ? "Update profile" : "Create host profile"} className="mt-4 grid gap-4 sm:grid-cols-2">
            <>
                <FormField name="hostType" label="Host type" htmlFor="hostType" >
                  <Select id="hostType" name="hostType" defaultValue={host?.host_type ?? "homeowner"}>
                    {Object.entries(PROPERTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </FormField>
                <FormField name="displayName" label="Display name" htmlFor="displayName"  hint="Shown to drivers, e.g. your first name or business name.">
                  <Input id="displayName" name="displayName" defaultValue={host?.display_name ?? viewer.fullName.split(" ")[0]} />
                </FormField>
                <FormField name="contactPhone" label="Contact phone (private)" htmlFor="contactPhone"  hint="For ChargeShare support only. Never shown to drivers.">
                  <Input id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={host?.contact_phone ?? ""} />
                </FormField>
                <FormField name="bio" label="About you (optional)" htmlFor="bio"  className="sm:col-span-2">
                  <Textarea id="bio" name="bio" defaultValue={host?.bio ?? ""} maxLength={1000} />
                </FormField>
              </>
          </ActionForm>
        </Card>

        <Card className={`p-5 sm:p-6 ${host ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!host}>
          <div className="flex items-start justify-between gap-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-full bg-ink-900 text-xs text-white">2</span>
              <UserRound className="size-4 text-volt-600" aria-hidden /> Identity verification
            </h2>
            {identity ? <VerificationPill status={identity.status} simulated={identity.is_simulated} /> : null}
          </div>
          <p className="mt-2 text-sm text-ink-600">{CHECK_INFO.identity.what} {CHECK_INFO.identity.evidence}</p>
          {identity?.decision_reason && identity.status !== "verified" ? (
            <p className="mt-3 rounded-xl bg-warn-100/70 p-3 text-sm"><strong>Reviewer note:</strong> {identity.decision_reason}</p>
          ) : null}
          {host && identity && ["not_submitted", "needs_info", "rejected"].includes(identity.status) ? (
            <VerificationForm
              checkType="identity"
              resubmit={identity.status !== "not_submitted"}
              evidenceHint="Upload a clear copy of your ID. Mask your Aadhaar number except the last 4 digits."
              detailFields={[
                { name: "document_type", label: "Document type", placeholder: "e.g. Passport, Driving licence, masked Aadhaar" },
                { name: "name_on_document", label: "Name as on document" },
              ]}
            />
          ) : identity?.status === "pending_review" ? (
            <p className="mt-3 text-sm text-ink-500">Submitted. We usually review within 2 working days.</p>
          ) : null}
        </Card>

        <Card className={`p-5 sm:p-6 ${host ? "" : "pointer-events-none opacity-50"}`} id="checklist">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-full bg-ink-900 text-xs text-white">3</span>
            <ClipboardCheck className="size-4 text-volt-600" aria-hidden /> Pre-listing safety checklist
            {checklistDone ? <CheckCircle2 className="size-4 text-go-600" aria-label="Done" /> : null}
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            These are your own declarations, not a ChargeShare verification. Each listing still needs documents for every check before it can go live.
          </p>
          <ActionForm action={safetyChecklistAction} submit="Save checklist" variant="outline" className="mt-4">
            <ul className="space-y-2">
              {SAFETY_ITEMS.map(([k, label]) => (
                <li key={k}>
                  <label className="flex gap-3 rounded-xl border border-ink-100 p-3 text-sm has-[:checked]:border-go-600/30 has-[:checked]:bg-go-100/40">
                    <input type="checkbox" name={k} defaultChecked={!!checklist[k]} className="mt-0.5 size-4 shrink-0 accent-volt-600" />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          </ActionForm>
        </Card>

        {host ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink-900 p-5 text-white">
            <div>
              <div className="font-semibold">Ready to list a charger?</div>
              <div className="text-sm text-ink-300">Create a draft now; it goes live only after all checks are approved.</div>
            </div>
            <LinkButton href="/host/listings/new" variant="volt">Create a listing</LinkButton>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
