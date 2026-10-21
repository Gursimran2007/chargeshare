import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { commissionAction } from "../actions";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/domain/time";

export const metadata = { title: "Admin · Settings" };

export default async function AdminSettings() {
  const db = await getDb();
  const { rows } = await db.query<{ key: string; value: number; description: string; updated_at: Date }>("select key, value, description, updated_at from public.platform_settings order by key");
  const commission = rows.find((r) => r.key === "commission_bps")!;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h1 className="text-xl font-semibold">Platform commission</h1>
        <p className="mt-1 text-sm text-ink-500">Currently <strong>{Number(commission.value) / 100}%</strong>. Changes apply to new bookings only; existing bookings keep the rate snapshotted when they were created.</p>
        <ActionForm action={commissionAction} submit="Update commission" className="mt-4">
          <Field label="Commission (%)" htmlFor="percent"><Input id="percent" name="percent" type="number" min="0" max="50" step="0.5" defaultValue={Number(commission.value) / 100} /></Field>
          <Field label="Reason (audit log)" htmlFor="reason"><Input id="reason" name="reason" required /></Field>
        </ActionForm>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-semibold">All settings</h2>
        <ul className="mt-3 divide-y divide-ink-100 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="py-2.5">
              <div className="flex justify-between font-mono text-xs"><span>{r.key}</span><span className="font-semibold">{String(r.value)}</span></div>
              <div className="text-xs text-ink-500">{r.description} · updated {formatDateTime(r.updated_at)}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
