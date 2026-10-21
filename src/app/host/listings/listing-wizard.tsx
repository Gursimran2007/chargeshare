"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, LocateFixed, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { saveListingAction } from "../actions";
import { Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { ACCESS_LABEL, AMENITIES, PROPERTY_LABEL } from "@/lib/labels";
import { LOCALITIES } from "@/lib/geo";
import type { ListingInput } from "@/lib/validation";

interface Connector { code: string; label: string; listable: boolean; max_kw: number; description: string }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STEPS = [
  { title: "Basics", fields: ["title", "description", "propertyType"] },
  { title: "Charger", fields: ["connectorType", "chargerMake", "chargerModel", "ratedPowerKw", "supportedVehicleNotes"] },
  { title: "Location", fields: ["locality", "addressLine", "pincode", "lat", "lng", "city"] },
  { title: "Access", fields: ["accessType", "parkingDetails", "accessInstructions", "restrictions", "amenities"] },
  { title: "Pricing & rules", fields: ["pricePerHour", "bookingFee", "minDurationMinutes", "maxDurationMinutes", "bufferMinutes", "advanceNoticeMinutes", "cancellationPolicy", "instantBook"] },
  { title: "Availability", fields: ["availability"] },
] as const;

type Draft = Omit<ListingInput, "availability"> & { availability: { weekday: number; start: string; end: string }[] };

const EMPTY: Draft = {
  title: "", description: "", propertyType: "homeowner", connectorType: "type2_ac", chargerMake: "", chargerModel: "",
  ratedPowerKw: 7.4, addressLine: "", locality: "", city: "Chennai", pincode: "", lat: 13.0475, lng: 80.2209,
  accessType: "private_driveway", parkingDetails: "", accessInstructions: "", restrictions: "", amenities: [],
  supportedVehicleNotes: "", pricePerHour: 120, bookingFee: 0, minDurationMinutes: 60, maxDurationMinutes: 240,
  bufferMinutes: 15, advanceNoticeMinutes: 60, cancellationPolicy: "moderate", instantBook: true,
  availability: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, start: "08:00", end: "20:00" })),
};

export function ListingWizard({ connectors, initial, listingId }: { connectors: Connector[]; initial?: Draft; listingId?: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial ?? EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const err = (k: string) => errors[k];
  const conn = connectors.find((c) => c.code === d.connectorType);
  const commission = Math.round(d.pricePerHour * 0.15 * 100) / 100;

  function save() {
    start(async () => {
      const r = await saveListingAction(listingId ?? null, d);
      if (!r) return;
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        const first = Object.keys(r.fieldErrors ?? {})[0]?.split(".")[0];
        const idx = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(first));
        if (idx >= 0) setStep(idx);
        toast.error(r.message ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(r.message ?? "Saved");
      router.push(`/host/listings/${r.id}`);
      router.refresh();
    });
  }

  function toggleDay(weekday: number, on: boolean) {
    set("availability", on ? [...d.availability, { weekday, start: "08:00", end: "20:00" }] : d.availability.filter((a) => a.weekday !== weekday));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {STEPS.map((s, i) => {
          const hasErr = s.fields.some((f) => Object.keys(errors).some((e) => e === f || e.startsWith(`${f}.`)));
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium",
                  i === step ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100",
                  hasErr && i !== step && "text-stop-600",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-full text-xs", i === step ? "bg-volt-500 text-ink-950" : i < step ? "bg-go-100 text-go-600" : "bg-ink-100")}>
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <Card className="p-5 sm:p-7">
        <h2 className="mb-5 text-xl font-semibold">{STEPS[step].title}</h2>
        {step === 0 ? (
          <div className="grid gap-4">
            <Field label="Listing title" htmlFor="title" error={err("title")} hint="e.g. Covered 7.4 kW home charger near Adyar signal">
              <Input id="title" value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={90} />
            </Field>
            <Field label="Description" htmlFor="description" error={err("description")}>
              <Textarea id="description" value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} placeholder="What makes this spot convenient? Nearby landmarks, what drivers can do while charging." />
            </Field>
            <Field label="Property type" htmlFor="propertyType" error={err("propertyType")}>
              <Select id="propertyType" value={d.propertyType} onChange={(e) => set("propertyType", e.target.value as Draft["propertyType"])}>
                {Object.entries(PROPERTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Connector" htmlFor="connectorType" error={err("connectorType")} className="sm:col-span-2" hint={conn?.description}>
              <Select id="connectorType" value={d.connectorType} onChange={(e) => set("connectorType", e.target.value)}>
                {connectors.map((c) => <option key={c.code} value={c.code} disabled={!c.listable}>{c.label}{c.listable ? "" : " (not permitted)"}</option>)}
              </Select>
            </Field>
            <div className="flex gap-2 rounded-xl border border-warn-600/20 bg-warn-100/50 p-3 text-xs text-ink-700 sm:col-span-2">
              <ShieldAlert className="size-4 shrink-0 text-warn-600" aria-hidden />
              Only certified EV chargers on a suitable dedicated circuit can be listed. Household sockets and extension leads are not allowed.
            </div>
            <Field label="Charger make" htmlFor="chargerMake" error={err("chargerMake")}><Input id="chargerMake" value={d.chargerMake} onChange={(e) => set("chargerMake", e.target.value)} placeholder="e.g. Delta" /></Field>
            <Field label="Model" htmlFor="chargerModel" error={err("chargerModel")}><Input id="chargerModel" value={d.chargerModel} onChange={(e) => set("chargerModel", e.target.value)} placeholder="As on the rating plate" /></Field>
            <Field label="Rated power (kW)" htmlFor="ratedPowerKw" error={err("ratedPowerKw")} hint={conn ? `Up to ${conn.max_kw} kW for this connector. Use the figure on the rating plate.` : undefined}>
              <Input id="ratedPowerKw" type="number" step="0.1" min="1" value={d.ratedPowerKw} onChange={(e) => set("ratedPowerKw", Number(e.target.value))} />
            </Field>
            <Field label="Vehicle notes (optional)" htmlFor="supportedVehicleNotes" error={err("supportedVehicleNotes")}>
              <Input id="supportedVehicleNotes" value={d.supportedVehicleNotes} onChange={(e) => set("supportedVehicleNotes", e.target.value)} placeholder="e.g. Tethered 5 m cable" />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Locality" htmlFor="locality" error={err("locality")}>
              <Select
                id="locality"
                value={d.locality}
                onChange={(e) => {
                  const l = LOCALITIES.find((x) => x.name === e.target.value);
                  setD((x) => ({ ...x, locality: e.target.value, ...(l && !listingId ? { lat: l.lat, lng: l.lng } : {}) }));
                }}
              >
                <option value="">Choose…</option>
                {LOCALITIES.map((l) => <option key={l.name}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="PIN code" htmlFor="pincode" error={err("pincode")}><Input id="pincode" inputMode="numeric" maxLength={6} value={d.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
            <Field label="Full address" htmlFor="addressLine" error={err("addressLine")} className="sm:col-span-2" hint="Private. Shared only with drivers who have a confirmed booking.">
              <Input id="addressLine" value={d.addressLine} onChange={(e) => set("addressLine", e.target.value)} />
            </Field>
            <Field label="Latitude" htmlFor="lat" error={err("lat")}><Input id="lat" type="number" step="0.00001" value={d.lat} onChange={(e) => set("lat", Number(e.target.value))} /></Field>
            <Field label="Longitude" htmlFor="lng" error={err("lng")}><Input id="lng" type="number" step="0.00001" value={d.lng} onChange={(e) => set("lng", Number(e.target.value))} /></Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.geolocation?.getCurrentPosition((p) =>
                    setD((x) => ({ ...x, lat: Number(p.coords.latitude.toFixed(5)), lng: Number(p.coords.longitude.toFixed(5)) })),
                  )
                }
              >
                <LocateFixed className="size-4" aria-hidden /> Use my current location
              </Button>
              <p className="mt-2 text-xs text-ink-500">Drivers see only an approximate area (about 300–450 m away) until they book.</p>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <Field label="Access type" htmlFor="accessType" error={err("accessType")}>
              <Select id="accessType" value={d.accessType} onChange={(e) => set("accessType", e.target.value as Draft["accessType"])}>
                {Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Parking details" htmlFor="parkingDetails" error={err("parkingDetails")} hint="Bay number, covered or open, size limits.">
              <Textarea id="parkingDetails" value={d.parkingDetails} onChange={(e) => set("parkingDetails", e.target.value)} />
            </Field>
            <Field label="Access instructions" htmlFor="accessInstructions" error={err("accessInstructions")} hint="Private. Shown after a booking is confirmed.">
              <Textarea id="accessInstructions" value={d.accessInstructions} onChange={(e) => set("accessInstructions", e.target.value)} />
            </Field>
            <Field label="Restrictions (optional)" htmlFor="restrictions" error={err("restrictions")}>
              <Input id="restrictions" value={d.restrictions} onChange={(e) => set("restrictions", e.target.value)} placeholder="e.g. No overnight parking" />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Amenities</legend>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => (
                  <label key={a} className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-1.5 text-sm has-[:checked]:border-volt-500 has-[:checked]:bg-volt-50">
                    <input type="checkbox" className="accent-volt-600" checked={d.amenities.includes(a)} onChange={(e) => set("amenities", e.target.checked ? [...d.amenities, a] : d.amenities.filter((x) => x !== a))} />
                    {a}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price per hour (₹)" htmlFor="pricePerHour" error={err("pricePerHour")} hint={`You receive about ₹${(d.pricePerHour - commission).toFixed(2)}/hr after the 15% platform commission.`}>
              <Input id="pricePerHour" type="number" min="10" step="5" value={d.pricePerHour} onChange={(e) => set("pricePerHour", Number(e.target.value))} />
            </Field>
            <Field label="Booking fee per session (₹, optional)" htmlFor="bookingFee" error={err("bookingFee")}>
              <Input id="bookingFee" type="number" min="0" step="5" value={d.bookingFee} onChange={(e) => set("bookingFee", Number(e.target.value))} />
            </Field>
            {(
              [
                ["minDurationMinutes", "Minimum booking", [30, 60, 90, 120, 180]],
                ["maxDurationMinutes", "Maximum booking", [60, 120, 180, 240, 360, 480, 720]],
                ["bufferMinutes", "Buffer between bookings", [0, 10, 15, 30, 45, 60]],
                ["advanceNoticeMinutes", "Advance notice", [0, 30, 60, 120, 240, 720, 1440]],
              ] as const
            ).map(([k, label, opts]) => (
              <Field key={k} label={label} htmlFor={k} error={err(k)}>
                <Select id={k} value={d[k]} onChange={(e) => set(k, Number(e.target.value))}>
                  {opts.map((m) => <option key={m} value={m}>{m === 0 ? "None" : m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
                </Select>
              </Field>
            ))}
            <Field label="Cancellation policy" htmlFor="cancellationPolicy" error={err("cancellationPolicy")}>
              <Select id="cancellationPolicy" value={d.cancellationPolicy} onChange={(e) => set("cancellationPolicy", e.target.value as Draft["cancellationPolicy"])}>
                <option value="flexible">Flexible: full refund until 2 h before</option>
                <option value="moderate">Moderate: full refund until 24 h before</option>
                <option value="strict">Strict: 50% refund until 24 h before</option>
              </Select>
            </Field>
            <Field label="Booking mode" htmlFor="instantBook">
              <Select id="instantBook" value={d.instantBook ? "1" : "0"} onChange={(e) => set("instantBook", e.target.value === "1")}>
                <option value="1">Instant book</option>
                <option value="0">I approve each request</option>
              </Select>
            </Field>
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            {err("availability") ? <p role="alert" className="mb-3 text-sm font-medium text-stop-600">{err("availability")}</p> : null}
            <ul className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                const rules = d.availability.filter((a) => a.weekday === wd);
                const on = rules.length > 0;
                return (
                  <li key={wd} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 p-3">
                    <label className="flex w-32 items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="size-4 accent-volt-600" checked={on} onChange={(e) => toggleDay(wd, e.target.checked)} />
                      {DAYS[wd]}
                    </label>
                    {on ? (
                      rules.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Input aria-label={`${DAYS[wd]} from`} type="time" step={1800} value={r.start} className="h-9 w-28" onChange={(e) => set("availability", d.availability.map((a) => (a === r ? { ...a, start: e.target.value } : a)))} />
                          <span className="text-ink-500">to</span>
                          <Input aria-label={`${DAYS[wd]} until`} type="time" step={1800} value={r.end === "24:00" ? "23:59" : r.end} className="h-9 w-28" onChange={(e) => set("availability", d.availability.map((a) => (a === r ? { ...a, end: e.target.value === "23:59" ? "24:00" : e.target.value } : a)))} />
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-ink-500">Unavailable</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-500">Block specific dates (holidays, maintenance) from the listing page after saving.</p>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between border-t border-ink-100 pt-5">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="size-4" aria-hidden /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" variant="volt" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} {listingId ? "Save changes" : "Save draft listing"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export type { Draft as ListingDraft };
