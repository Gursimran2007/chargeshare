import { Car, Star } from "lucide-react";
import { ActionForm, FormField } from "@/components/action-form";
import { Badge, Card, Container, Input, PageHeader } from "@/components/ui";
import { VehicleForm } from "./vehicle-form";
import { defaultVehicleAction, deleteVehicleAction, profileAction } from "./actions";
import { getDb } from "@/lib/db";
import { requireViewer } from "@/lib/auth";
import { CONNECTOR_SHORT } from "@/lib/labels";

export const metadata = { title: "Profile & vehicles" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const viewer = await requireViewer("/account");
  const db = await getDb();
  const [{ rows: profile }, { rows: vehicles }, { rows: models }, { rows: connectors }] = await Promise.all([
    db.query<{ full_name: string; phone: string | null; city: string }>("select full_name, phone, city from public.profiles where id = $1", [viewer.userId]),
    db.query<{ id: string; nickname: string; make: string; model: string; battery_kwh: number | null; max_ac_kw: number | null; connectors: string[]; is_default: boolean }>(
      "select * from public.vehicles where owner_id = $1 order by is_default desc, created_at",
      [viewer.userId],
    ),
    db.query<{ id: string; make: string; model: string; battery_kwh: number | null; max_ac_kw: number | null; connectors: string[]; notes: string }>(
      "select * from public.vehicle_models order by make, model",
    ),
    db.query<{ code: string; label: string; listable: boolean }>("select code, label, listable from public.connector_types order by sort_order"),
  ]);
  const p = profile[0];
  return (
    <Container className="max-w-4xl py-8 sm:py-12">
      <PageHeader title="Profile & vehicles" subtitle={sp.welcome ? "Welcome to ChargeShare! Add your vehicle so we can match you with compatible chargers." : viewer.email} />
      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Car className="size-5 text-volt-600" aria-hidden /> Your vehicles</h2>
          {vehicles.length ? (
            <ul className="mb-6 grid gap-3 sm:grid-cols-2">
              {vehicles.map((v) => (
                <li key={v.id} className="rounded-2xl border border-ink-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{v.make} {v.model}</div>
                      {v.nickname ? <div className="text-xs text-ink-500">{v.nickname}</div> : null}
                    </div>
                    {v.is_default ? <Badge tone="volt"><Star className="size-3" aria-hidden /> Default</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.connectors.map((c) => <Badge key={c}>{CONNECTOR_SHORT[c] ?? c}</Badge>)}
                    {v.max_ac_kw ? <Badge tone="outline">{v.max_ac_kw} kW AC</Badge> : null}
                    {v.battery_kwh ? <Badge tone="outline">{v.battery_kwh} kWh</Badge> : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!v.is_default ? <ActionForm action={defaultVehicleAction} hidden={{ id: v.id }} submit="Make default" variant="ghost" /> : null}
                    <ActionForm action={deleteVehicleAction} hidden={{ id: v.id }} submit="Remove" variant="ghost" confirm={{ title: "Remove this vehicle?", body: "Past bookings keep their records.", label: "Remove" }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-6 text-sm text-ink-500">No vehicles yet.</p>
          )}
          <h3 className="mb-3 text-sm font-semibold text-ink-700">Add a vehicle</h3>
          <VehicleForm models={models} connectors={connectors} />
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Profile</h2>
          <ActionForm action={profileAction} submit="Save profile" className="grid gap-4 sm:max-w-md">
            <>
                <FormField name="fullName" label="Full name" htmlFor="fullName" ><Input id="fullName" name="fullName" defaultValue={p.full_name} required /></FormField>
                <FormField name="phone" label="Phone (private)" htmlFor="phone"  hint="Never shown to hosts or drivers."><Input id="phone" name="phone" defaultValue={p.phone ?? ""} inputMode="tel" /></FormField>
                <FormField name="city" label="City" htmlFor="city" ><Input id="city" name="city" defaultValue={p.city} /></FormField>
              </>
          </ActionForm>
        </Card>
      </div>
    </Container>
  );
}
