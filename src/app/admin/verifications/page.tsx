import Link from "next/link";
import { ClipboardList, FileText } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Select, Textarea } from "@/components/ui";
import { ListingStatusPill, VerificationPill } from "@/components/domain";
import { approveListingAction, moderateListingAction, reviewCheckAction } from "../actions";
import { getDb } from "@/lib/db";
import { CHECK_INFO, type CheckType } from "@/lib/services/verification";
import { formatDate } from "@/lib/domain/time";
import { CONNECTOR_SHORT } from "@/lib/labels";

export const metadata = { title: "Admin · Verification queue" };

interface Check {
  id: string; check_type: CheckType; status: string; details: Record<string, string>; evidence_paths: string[];
  submitted_at: Date | null; submission_count: number; is_simulated: boolean; decision_reason: string | null;
}

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="rounded-xl border border-ink-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{CHECK_INFO[c.check_type].title}</div>
        <VerificationPill status={c.status} simulated={c.is_simulated} />
      </div>
      <div className="mt-1 text-xs text-ink-500">
        {c.submitted_at ? `Submitted ${formatDate(c.submitted_at)} · attempt ${c.submission_count}` : "Not submitted"}
      </div>
      {Object.keys(c.details).length ? (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {Object.entries(c.details).map(([k, v]) => <div key={k}><dt className="inline text-ink-500">{k.replace(/_/g, " ")}: </dt><dd className="inline">{v || "—"}</dd></div>)}
        </dl>
      ) : null}
      {c.evidence_paths.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.evidence_paths.map((p, i) => (
            <a key={p} href={`/api/files/${p}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2 py-1 text-xs font-medium text-volt-700 hover:underline">
              <FileText className="size-3.5" aria-hidden /> Evidence {i + 1}
            </a>
          ))}
        </div>
      ) : null}
      {c.status === "pending_review" || c.status === "verified" ? (
        <ActionForm action={reviewCheckAction} hidden={{ id: c.id }} submit="Record decision" variant="outline" className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr] sm:items-end">
          <Field label="Decision" htmlFor={`d-${c.id}`}>
            <Select id={`d-${c.id}`} name="decision" defaultValue={c.status === "verified" ? "suspended" : "verified"}>
              {c.status !== "verified" ? <option value="verified">Verify</option> : null}
              {c.status !== "verified" ? <option value="needs_info">Needs more info</option> : null}
              {c.status !== "verified" ? <option value="rejected">Reject</option> : null}
              <option value="suspended">Suspend</option>
            </Select>
          </Field>
          <Field label="Reason (shown to host)" htmlFor={`r-${c.id}`}>
            <Textarea id={`r-${c.id}`} name="reason" className="min-h-11" placeholder="Required unless verifying" />
          </Field>
        </ActionForm>
      ) : null}
    </li>
  );
}

export default async function VerificationQueue() {
  const db = await getDb();
  const { rows: listings } = await db.query<{ id: string; title: string; status: string; locality: string; connector_type: string; rated_power_kw: number; charger_make: string; charger_model: string; host_id: string; host_name: string; is_demo: boolean; complete: boolean }>(
    `select l.id, l.title, l.status, l.locality, l.connector_type, l.rated_power_kw, l.charger_make, l.charger_model, l.host_id,
            h.display_name as host_name, l.is_demo, public.listing_checks_complete(l.id) as complete
       from public.charger_listings l join public.host_profiles h on h.user_id = l.host_id
      where l.status in ('pending_review', 'changes_requested')
         or exists (select 1 from public.charger_verifications v where v.listing_id = l.id and v.status = 'pending_review')
      order by l.updated_at`,
  );
  const { rows: identities } = await db.query<Check & { host_id: string; host_name: string }>(
    `select v.*, h.display_name as host_name from public.charger_verifications v join public.host_profiles h on h.user_id = v.host_id
      where v.check_type = 'identity' and (v.status = 'pending_review' or v.host_id = any($1))`,
    [listings.map((l) => l.host_id)],
  );
  const { rows: checks } = await db.query<Check & { listing_id: string }>(
    "select * from public.charger_verifications where listing_id = any($1) order by array_position(array['property_permission','charger_spec','installation_evidence','electrical_safety']::verification_check[], check_type)",
    [listings.map((l) => l.id)],
  );
  const standaloneIds = identities.filter((i) => i.status === "pending_review" && !listings.some((l) => l.host_id === i.host_id));
  if (!listings.length && !standaloneIds.length) {
    return <EmptyState icon={<ClipboardList className="size-6" />} title="Queue is clear" body="New host and listing submissions will appear here." />;
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Verification queue</h1>
      <p className="text-sm text-ink-500">Review each check on its own merits. A listing can only be approved when identity and all four listing checks are verified; the database enforces this too.</p>
      {standaloneIds.map((i) => (
        <Card key={i.id} className="p-5">
          <div className="mb-3 font-semibold">Host identity · {i.host_name}</div>
          <ul><CheckRow c={i} /></ul>
        </Card>
      ))}
      {listings.map((l) => {
        const id = identities.find((i) => i.host_id === l.host_id);
        return (
          <Card key={l.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><ListingStatusPill status={l.status} />{l.is_demo ? <Badge tone="warn">Demo data</Badge> : null}</div>
                <h2 className="mt-1 text-lg font-semibold">{l.title}</h2>
                <p className="text-sm text-ink-500">Host: {l.host_name} · {l.locality} · {CONNECTOR_SHORT[l.connector_type]} {l.rated_power_kw} kW · {l.charger_make} {l.charger_model}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {l.complete ? <ActionForm action={approveListingAction} hidden={{ listingId: l.id }} submit="Approve listing" variant="volt" /> : <Badge>Approve after all checks verified</Badge>}
                <ActionForm
                  action={moderateListingAction}
                  hidden={{ listingId: l.id }}
                  submit="Reject / request changes"
                  variant="outline"
                  confirm={{ title: "Send back or reject this listing", body: "The host is notified with your reason.", label: "Confirm" }}
                >
                  <Field label="Action" htmlFor={`act-${l.id}`}>
                    <Select id={`act-${l.id}`} name="act" defaultValue="request_changes">
                      <option value="request_changes">Request changes</option>
                      <option value="reject">Reject</option>
                    </Select>
                  </Field>
                  <Field label="Reason" htmlFor={`rs-${l.id}`}><Textarea id={`rs-${l.id}`} name="reason" required /></Field>
                </ActionForm>
                <Link href={`/admin/listings?q=${l.id}`} className="self-center text-sm text-ink-500 underline">Details</Link>
              </div>
            </div>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {id ? <CheckRow c={id} /> : null}
              {checks.filter((c) => c.listing_id === l.id).map((c) => <CheckRow key={c.id} c={c} />)}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
