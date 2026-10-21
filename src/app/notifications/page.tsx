import Link from "next/link";
import { Bell } from "lucide-react";
import { Container, EmptyState, PageHeader, cn } from "@/components/ui";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/services/accounts";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/notifications");
  const db = await getDb();
  const { rows } = await db.query<{ id: string; title: string; body: string; link: string | null; read_at: Date | null; created_at: Date }>(
    "select id, title, body, link, read_at, created_at from public.notifications where user_id = $1 and channel = 'in_app' order by created_at desc limit 100",
    [viewer.userId],
  );
  await markNotificationsRead(db, viewer);
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <PageHeader title="Notifications" />
      {rows.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
          {rows.map((n) => {
            const inner = (
              <div className={cn("flex gap-3 p-4", !n.read_at && "bg-volt-50/60")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-volt-500")} />
                <div>
                  <div className="text-sm font-semibold">{n.title}</div>
                  {n.body ? <div className="text-sm text-ink-600">{n.body}</div> : null}
                  <div className="mt-1 text-xs text-ink-400">{formatDateTime(n.created_at)}</div>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link?.startsWith("/") ? <Link href={n.link} className="block hover:bg-ink-50">{inner}</Link> : inner}</li>;
          })}
        </ul>
      ) : (
        <EmptyState icon={<Bell className="size-6" />} title="You're all caught up" body="Booking updates, messages and verification decisions appear here." />
      )}
    </Container>
  );
}
