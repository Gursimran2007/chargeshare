import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Field, Select, Textarea } from "@/components/ui";
import { ListingStatusPill } from "@/components/domain";
import { approveListingAction, moderateListingAction } from "../actions";
import { getDb } from "@/lib/db";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Admin · Listings" };

export default async function AdminListings() {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; title: string; status: string; locality: string; price_per_hour_paise: number; host_name: string; is_demo: boolean; complete: boolean; bookings: number }>(
    `select l.id, l.title, l.status, l.locality, l.price_per_hour_paise, h.display_name as host_name, l.is_demo,
            public.listing_checks_complete(l.id) as complete,
            (select count(*)::int from public.bookings b where b.listing_id = l.id) as bookings
       from public.charger_listings l join public.host_profiles h on h.user_id = l.host_id order by l.created_at desc`,
  );
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Listings</h1>
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">Listing</th><th className="px-4 py-3">Host</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Checks</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="max-w-64 px-4 py-3">
                  <Link href={l.status === "active" ? `/chargers/${l.id}` : `/admin/verifications`} className="font-medium hover:underline">{l.title}</Link>
                  <div className="text-xs text-ink-500">{l.locality} {l.is_demo ? <Badge tone="warn" className="ml-1">Demo</Badge> : null}</div>
                </td>
                <td className="px-4 py-3">{l.host_name}</td>
                <td className="px-4 py-3"><ListingStatusPill status={l.status} /></td>
                <td className="px-4 py-3">{l.complete ? <Badge tone="go">All verified</Badge> : <Badge tone="warn">Incomplete</Badge>}</td>
                <td className="px-4 py-3">{formatINR(l.price_per_hour_paise)}/hr</td>
                <td className="px-4 py-3">{l.bookings}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {["suspended", "rejected", "pending_review", "changes_requested"].includes(l.status) && l.complete ? (
                      <ActionForm action={approveListingAction} hidden={{ listingId: l.id }} submit={l.status === "suspended" ? "Reinstate" : "Approve"} variant="outline" />
                    ) : null}
                    {["active", "paused"].includes(l.status) ? (
                      <ActionForm action={moderateListingAction} hidden={{ listingId: l.id, act: "suspend" }} submit="Suspend" variant="outline" confirm={{ title: "Suspend this listing?", body: "It is removed from search immediately. Review existing bookings separately.", label: "Suspend" }}>
                        <Field label="Reason (shown to host)" htmlFor={`s-${l.id}`}><Textarea id={`s-${l.id}`} name="reason" required /></Field>
                      </ActionForm>
                    ) : null}
                    {l.status === "pending_review" ? (
                      <ActionForm action={moderateListingAction} hidden={{ listingId: l.id }} submit="Reject" variant="ghost" confirm={{ title: "Reject or send back", body: "The host is notified.", label: "Confirm" }}>
                        <Field label="Action" htmlFor={`a-${l.id}`}><Select id={`a-${l.id}`} name="act"><option value="request_changes">Request changes</option><option value="reject">Reject</option></Select></Field>
                        <Field label="Reason" htmlFor={`r-${l.id}`}><Textarea id={`r-${l.id}`} name="reason" required /></Field>
                      </ActionForm>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
