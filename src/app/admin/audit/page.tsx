import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Admin · Audit log" };

export default async function AuditLog() {
  const db = await getDb();
  const { rows } = await db.query<{ id: number; action: string; target_type: string; target_id: string; reason: string | null; created_at: Date; actor: string | null; after_state: unknown }>(
    `select a.id, a.action, a.target_type, a.target_id, a.reason, a.created_at, a.after_state, u.email as actor
       from public.admin_audit_logs a left join auth.users u on u.id = a.actor_id order by a.created_at desc, a.id desc limit 300`,
  );
  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="mb-4 mt-1 text-sm text-ink-500">Append-only. The database rejects updates and deletes on this table.</p>
      <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Reason / data</th></tr></thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{formatDateTime(r.created_at)}</td>
                <td className="px-4 py-2.5">{r.actor ?? "system"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.target_type}:{r.target_id.slice(0, 8)}</td>
                <td className="max-w-md px-4 py-2.5 text-xs text-ink-600">{r.reason}{r.after_state ? <code className="mt-1 block truncate text-ink-400">{JSON.stringify(r.after_state)}</code> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
