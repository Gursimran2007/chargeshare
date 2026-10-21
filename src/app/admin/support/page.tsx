import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Select, Textarea } from "@/components/ui";
import { reportAction, ticketAction } from "../actions";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Admin · Support & incidents" };

const SEV_TONE = { critical: "stop", high: "stop", medium: "warn", low: "neutral" } as const;

export default async function AdminSupport() {
  const db = await getDb();
  const { rows: reports } = await db.query<{ id: string; target_type: string; target_id: string; reason: string; details: string; severity: keyof typeof SEV_TONE; status: string; created_at: Date; reporter: string; resolution_note: string | null }>(
    `select r.*, u.email as reporter from public.reports r join auth.users u on u.id = r.reporter_id
      order by (r.status in ('open','investigating')) desc, array_position(array['critical','high','medium','low']::report_severity[], r.severity), r.created_at desc`,
  );
  const { rows: tickets } = await db.query<{ id: string; category: string; subject: string; description: string; status: string; created_at: Date; email: string; booking_id: string | null; admin_response: string | null }>(
    `select t.*, u.email from public.support_tickets t join auth.users u on u.id = t.user_id order by (t.status in ('open','in_progress')) desc, t.created_at desc`,
  );
  const target = (t: string, id: string) => (t === "listing" ? `/chargers/${id}` : t === "booking" ? `/bookings/${id}` : `/admin/users`);
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Safety reports & incidents</h1>
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEV_TONE[r.severity]}>{r.severity}</Badge>
                <Badge>{r.status}</Badge>
                <span className="text-sm font-semibold">{r.reason.replace(/_/g, " ")}</span>
                <Link href={target(r.target_type, r.target_id)} className="text-xs text-volt-700 underline">{r.target_type}</Link>
              </div>
              <p className="mt-2 text-sm text-ink-700">{r.details}</p>
              <p className="mt-1 text-xs text-ink-500">{r.reporter} · {formatDateTime(r.created_at)}</p>
              {r.resolution_note ? <p className="mt-2 rounded-lg bg-ink-50 p-2 text-xs">{r.resolution_note}</p> : null}
              {["open", "investigating"].includes(r.status) ? (
                <ActionForm action={reportAction} hidden={{ reportId: r.id }} submit="Update" variant="outline" className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
                  <Select name="status" aria-label="Status" defaultValue="investigating"><option value="investigating">Investigating</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option></Select>
                  <Textarea name="note" aria-label="Note to reporter" placeholder="Note to reporter" className="min-h-11" />
                </ActionForm>
              ) : null}
            </Card>
          ))}
          {!reports.length ? <p className="text-sm text-ink-500">No reports.</p> : null}
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Support tickets</h2>
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge>{t.status.replace("_", " ")}</Badge><Badge tone="outline">{t.category}</Badge><span className="text-sm font-semibold">{t.subject}</span></div>
              <p className="mt-2 text-sm text-ink-700">{t.description}</p>
              <p className="mt-1 text-xs text-ink-500">{t.email} · {formatDateTime(t.created_at)}{t.booking_id ? <> · <Link href={`/bookings/${t.booking_id}`} className="underline">booking</Link></> : null}</p>
              {t.admin_response ? <p className="mt-2 rounded-lg bg-volt-50 p-2 text-xs"><strong>Reply:</strong> {t.admin_response}</p> : null}
              {["open", "in_progress"].includes(t.status) ? (
                <ActionForm action={ticketAction} hidden={{ ticketId: t.id }} submit="Reply" variant="outline" className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
                  <Select name="status" aria-label="Status" defaultValue="resolved"><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select>
                  <Field label="Reply to user" htmlFor={`t-${t.id}`} className="sm:col-span-1"><Textarea id={`t-${t.id}`} name="response" className="min-h-11" /></Field>
                </ActionForm>
              ) : null}
            </Card>
          ))}
          {!tickets.length ? <p className="text-sm text-ink-500">No tickets.</p> : null}
        </div>
      </section>
    </div>
  );
}
