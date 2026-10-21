import { ActionForm } from "@/components/action-form";
import { Badge, Field, Textarea } from "@/components/ui";
import { restrictAction } from "../actions";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { formatDate } from "@/lib/domain/time";

export const metadata = { title: "Admin · Users" };

export default async function AdminUsers() {
  const db = await getDb();
  const viewer = await getViewer();
  const { rows } = await db.query<{ id: string; email: string; full_name: string; roles: string[]; is_restricted: boolean; restricted_reason: string | null; created_at: Date; bookings: number; listings: number }>(
    `select p.id, u.email, p.full_name, array_agg(r.role::text order by r.role) as roles, p.is_restricted, p.restricted_reason, p.created_at,
            (select count(*)::int from public.bookings b where b.driver_id = p.id) as bookings,
            (select count(*)::int from public.charger_listings l where l.host_id = p.id) as listings
       from public.profiles p join auth.users u on u.id = p.id left join public.user_roles r on r.user_id = p.id
      group by p.id, u.email order by p.created_at desc`,
  );
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Users & hosts</h1>
      <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Listings</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><div className="font-medium">{u.full_name || "—"}</div><div className="text-xs text-ink-500">{u.email}</div></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={r === "admin" ? "ink" : r === "host" ? "volt" : "neutral"}>{r}</Badge>)}</div></td>
                <td className="px-4 py-3">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">{u.bookings}</td>
                <td className="px-4 py-3">{u.listings}</td>
                <td className="px-4 py-3">{u.is_restricted ? <Badge tone="stop" >Restricted</Badge> : <Badge tone="go">Active</Badge>}{u.restricted_reason ? <div className="mt-1 text-xs text-ink-500">{u.restricted_reason}</div> : null}</td>
                <td className="px-4 py-3">
                  {u.id === viewer?.userId ? null : u.is_restricted ? (
                    <ActionForm action={restrictAction} hidden={{ userId: u.id, restrict: "0" }} submit="Lift restriction" variant="outline" />
                  ) : (
                    <ActionForm action={restrictAction} hidden={{ userId: u.id, restrict: "1" }} submit="Restrict" variant="ghost" confirm={{ title: `Restrict ${u.email}?`, body: "They can no longer book or host. Their live listings are suspended.", label: "Restrict account" }}>
                      <Field label="Reason (recorded in audit log)" htmlFor={`rr-${u.id}`}><Textarea id={`rr-${u.id}`} name="reason" required /></Field>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
