import Link from "next/link";
import { LifeBuoy, Phone, ShieldAlert } from "lucide-react";
import { ActionForm, FormField } from "@/components/action-form";
import { Badge, Card, Container, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ticketCreateAction } from "./actions";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Help & support" };

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const sp = await searchParams;
  const viewer = await requireViewer("/support");
  const db = await getDb();
  const [{ rows: tickets }, { rows: reports }, { rows: bookings }] = await Promise.all([
    db.query<{ id: string; subject: string; status: string; category: string; created_at: Date; admin_response: string | null }>(
      "select id, subject, status, category, created_at, admin_response from public.support_tickets where user_id = $1 order by created_at desc",
      [viewer.userId],
    ),
    db.query<{ id: string; reason: string; status: string; created_at: Date; resolution_note: string | null }>(
      "select id, reason, status, created_at, resolution_note from public.reports where reporter_id = $1 order by created_at desc",
      [viewer.userId],
    ),
    db.query<{ id: string; code: string }>(
      "select id, code from public.bookings where driver_id = $1 or host_id = $1 order by start_at desc limit 20",
      [viewer.userId],
    ),
  ]);
  return (
    <Container className="max-w-5xl py-8 sm:py-12">
      <PageHeader title="Help & support" subtitle="Get help with a booking, payment, refund or your account." />
      <div className="mb-6 flex gap-3 rounded-xl border border-stop-600/20 bg-stop-100 p-4 text-sm text-stop-600">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        <div>
          <strong>Emergency?</strong> If there is fire, smoke, sparking or an injury, move away from the charger and call <a href="tel:112" className="font-bold underline">112</a>. Then{" "}
          <Link href="/support/report" className="font-semibold underline">report a safety incident</Link>.
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold"><LifeBuoy className="size-5 text-volt-600" aria-hidden /> New support request</h2>
          <ActionForm action={ticketCreateAction} submit="Send request" resetOnSuccess className="mt-4">
            <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField name="category" label="Topic" htmlFor="category" >
                    <Select id="category" name="category" defaultValue={typeof sp.category === "string" ? sp.category : "booking"}>
                      {["booking", "payment", "refund", "charger_issue", "account", "host", "safety", "other"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Related booking (optional)" htmlFor="bookingId">
                    <Select id="bookingId" name="bookingId" defaultValue={typeof sp.booking === "string" ? sp.booking : ""}>
                      <option value="">None</option>
                      {bookings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                    </Select>
                  </FormField>
                </div>
                <FormField name="subject" label="Subject" htmlFor="subject" ><Input id="subject" name="subject" maxLength={140} /></FormField>
                <FormField name="description" label="Details" htmlFor="description" ><Textarea id="description" name="description" maxLength={4000} /></FormField>
              </>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Your requests</h2>
            <ul className="mt-3 space-y-3">
              {tickets.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{t.subject}</span><Badge>{t.status.replace("_", " ")}</Badge></div>
                  <div className="text-xs text-ink-500">{t.category} · {formatDateTime(t.created_at)}</div>
                  {t.admin_response ? <p className="mt-1 rounded-lg bg-volt-50 p-2 text-xs">{t.admin_response}</p> : null}
                </li>
              ))}
              {!tickets.length ? <li className="text-sm text-ink-500">No requests yet.</li> : null}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Your reports</h2>
            <ul className="mt-3 space-y-3">
              {reports.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.reason.replace(/_/g, " ")}</span><Badge>{r.status}</Badge></div>
                  {r.resolution_note ? <p className="mt-1 text-xs text-ink-600">{r.resolution_note}</p> : null}
                </li>
              ))}
              {!reports.length ? <li className="text-sm text-ink-500">No reports.</li> : null}
            </ul>
          </Card>
          <p className="flex items-center gap-2 text-sm text-ink-500"><Phone className="size-4" aria-hidden /> Phone support will be added before public launch.</p>
        </div>
      </div>
    </Container>
  );
}
