"use client";

import { useActionState, useState } from "react";
import { vehicleAction } from "./actions";
import { Field, Input, Select } from "@/components/ui";
import { FormMessage, SubmitButton, useActionToast } from "@/components/form-bits";

interface Model { id: string; make: string; model: string; battery_kwh: number | null; max_ac_kw: number | null; connectors: string[]; notes: string }
interface Connector { code: string; label: string; listable: boolean }

export function VehicleForm({ models, connectors }: { models: Model[]; connectors: Connector[] }) {
  const [m, setM] = useState<Model | null>(null);
  const [key, setKey] = useState(0);
  const [state, action] = useActionState(async (prev: Parameters<typeof vehicleAction>[0], fd: FormData) => {
    const r = await vehicleAction(prev, fd);
    if (r?.ok) {
      // Remount the form to clear it after a successful add.
      setM(null);
      setKey((k) => k + 1);
    }
    return r;
  }, null);
  useActionToast(state);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" key={key}>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
      <Field label="Choose a model (optional)" htmlFor="modelId" className="sm:col-span-2" hint={m?.notes || "Indicative specs; check your vehicle manual."}>
        <Select id="modelId" name="modelId" defaultValue="" onChange={(ev) => setM(models.find((x) => x.id === ev.target.value) ?? null)}>
          <option value="">Other / enter manually</option>
          {models.map((x) => <option key={x.id} value={x.id}>{x.make} {x.model}</option>)}
        </Select>
      </Field>
      <Field label="Make" htmlFor="make" error={e.make}><Input id="make" name="make" key={`mk${m?.id}`} defaultValue={m?.make ?? ""} required /></Field>
      <Field label="Model" htmlFor="model" error={e.model}><Input id="model" name="model" key={`md${m?.id}`} defaultValue={m?.model ?? ""} required /></Field>
      <Field label="Battery (kWh)" htmlFor="batteryKwh" error={e.batteryKwh}><Input id="batteryKwh" name="batteryKwh" type="number" step="0.1" key={`b${m?.id}`} defaultValue={m?.battery_kwh ?? ""} /></Field>
      <Field label="Max AC charging (kW)" htmlFor="maxAcKw" error={e.maxAcKw} hint="Onboard charger limit, e.g. 7.2"><Input id="maxAcKw" name="maxAcKw" type="number" step="0.1" key={`a${m?.id}`} defaultValue={m?.max_ac_kw ?? ""} /></Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Connectors your vehicle can use</legend>
        <div className="flex flex-wrap gap-2" key={`c${m?.id}`}>
          {connectors.filter((c) => c.listable).map((c) => (
            <label key={c.code} className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm has-[:checked]:border-volt-500 has-[:checked]:bg-volt-50">
              <input type="checkbox" name="connectors" value={c.code} defaultChecked={m?.connectors.includes(c.code)} className="accent-volt-600" />
              {c.label}
            </label>
          ))}
        </div>
        {e.connectors ? <p role="alert" className="mt-1.5 text-xs font-medium text-stop-600">{e.connectors}</p> : null}
      </fieldset>
      <Field label="Nickname (optional)" htmlFor="nickname"><Input id="nickname" name="nickname" maxLength={60} /></Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="isDefault" className="size-4 accent-volt-600" /> Make default</label>
      <div className="sm:col-span-2"><SubmitButton>Add vehicle</SubmitButton></div>
    </form>
  );
}
