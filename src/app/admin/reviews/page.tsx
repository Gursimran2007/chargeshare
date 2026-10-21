import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Textarea } from "@/components/ui";
import { reviewVisibilityAction } from "../actions";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Admin · Reviews" };

export default async function AdminReviews() {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; rating: number; comment: string; host_reply: string | null; is_hidden: boolean; created_at: Date; author: string; listing_id: string; title: string; is_demo: boolean }>(
    `select r.id, r.rating, r.comment, r.host_reply, r.is_hidden, r.created_at, u.email as author, l.id as listing_id, l.title, l.is_demo
       from public.reviews r join auth.users u on u.id = r.author_id join public.charger_listings l on l.id = r.listing_id
      order by r.is_hidden, r.created_at desc limit 200`,
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Reviews</h1>
      <p className="mb-4 mt-1 text-sm text-ink-500">
        Only drivers with a completed session can review. Hide reviews that contain personal data, abuse or content unrelated to the session; low ratings alone are not a reason. Every change is audited.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className={`p-4 ${r.is_hidden ? "bg-ink-50" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{r.rating}/5</span>
              <Link href={`/chargers/${r.listing_id}`} className="text-volt-700 hover:underline">{r.title}</Link>
              {r.is_hidden ? <Badge tone="stop">Hidden</Badge> : <Badge tone="go">Public</Badge>}
              {r.is_demo ? <Badge tone="warn">Demo</Badge> : null}
              <span className="text-xs text-ink-500">{r.author} · {formatDateTime(r.created_at)}</span>
            </div>
            {r.comment ? <p className="mt-2 text-sm text-ink-700">{r.comment}</p> : <p className="mt-2 text-sm text-ink-500">(rating only)</p>}
            {r.host_reply ? <p className="mt-2 rounded-lg bg-ink-50 p-2 text-xs"><strong>Host reply:</strong> {r.host_reply}</p> : null}
            <div className="mt-3">
              {r.is_hidden ? (
                <ActionForm action={reviewVisibilityAction} hidden={{ reviewId: r.id, hide: "0" }} submit="Restore" variant="outline" />
              ) : (
                <ActionForm action={reviewVisibilityAction} hidden={{ reviewId: r.id, hide: "1" }} submit="Hide review" variant="ghost" confirm={{ title: "Hide this review?", body: "It will no longer appear on the listing or count towards its rating. The author is notified.", label: "Hide" }}>
                  <Field label="Reason (sent to the author and audited)" htmlFor={`hr-${r.id}`}><Textarea id={`hr-${r.id}`} name="reason" required /></Field>
                </ActionForm>
              )}
            </div>
          </Card>
        ))}
        {!rows.length ? <p className="text-sm text-ink-500">No reviews yet.</p> : null}
      </div>
    </div>
  );
}
