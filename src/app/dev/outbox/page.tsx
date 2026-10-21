import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Demo email outbox" };

/** Demo mode only: shows emails that would have been sent. Never available with a real database. */
export default async function OutboxPage() {
  if (!config.demoMode) notFound();
  const db = await getDb();
  const { rows } = await db.query<{ id: string; email: string; title: string; body: string; link: string | null; created_at: Date }>(
    `select n.id, u.email, n.title, n.body, n.link, n.created_at from public.notifications n
       join auth.users u on u.id = n.user_id where n.channel = 'email' order by n.created_at desc limit 50`,
  );
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <PageHeader eyebrow="Demo mode" title="Email outbox" subtitle="No email provider is configured, so outgoing emails are captured here instead of being sent." />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-2xl border border-ink-100 bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-500"><span>To: {m.email}</span><span>{formatDateTime(m.created_at)}</span></div>
              <div className="mt-1 font-semibold">{m.title}</div>
              <p className="text-sm text-ink-600">{m.body}</p>
              {m.link ? <a href={m.link} className="mt-2 inline-block break-all text-sm font-medium text-volt-700 underline">{m.link}</a> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Mail className="size-6" />} title="No emails yet" body="Trigger a password reset or a booking to see emails here." />
      )}
    </Container>
  );
}
