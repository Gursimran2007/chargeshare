"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, LocateFixed, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Input, Select, cn } from "@/components/ui";
import { CONNECTOR_SHORT, ACCESS_LABEL } from "@/lib/labels";

export function Filters({ hasVehicle, signedIn }: { hasVehicle: boolean; signedIn: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim()) params.set(k, v.trim());
    start(() => router.push(`/chargers?${params.toString()}`));
    setOpen(false);
  }

  function nearMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const params = new URLSearchParams(sp.toString());
        params.delete("q");
        params.set("lat", pos.coords.latitude.toFixed(4));
        params.set("lng", pos.coords.longitude.toFixed(4));
        start(() => router.push(`/chargers?${params.toString()}`));
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  }

  const active = ["connector", "minKw", "maxPrice", "access", "instant", "compat", "date"].filter((k) => sp.get(k)).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      className="space-y-3"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <label htmlFor="q" className="sr-only">Area or locality</label>
          <Input id="q" name="q" defaultValue={sp.get("q") ?? ""} placeholder="Area, e.g. Velachery" className="pl-9" list="localities" />
        </div>
        <Button type="button" variant="outline" onClick={nearMe} aria-label="Use my location" title="Use my location">
          {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filter-panel">
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {active ? <span className="grid size-5 place-items-center rounded-full bg-ink-900 text-[10px] text-white">{active}</span> : null}
        </Button>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Search"}</Button>
      </div>
      {sp.get("lat") ? <input type="hidden" name="lat" value={sp.get("lat")!} /> : null}
      {sp.get("lng") ? <input type="hidden" name="lng" value={sp.get("lng")!} /> : null}
      <div id="filter-panel" className={cn("grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2", !open && "hidden")}>
        <div>
          <label htmlFor="connector" className="mb-1 block text-xs font-medium text-ink-600">Connector</label>
          <Select id="connector" name="connector" defaultValue={sp.get("connector") ?? ""}>
            <option value="">Any connector</option>
            {["type2_ac", "bharat_ac001", "ccs2"].map((c) => <option key={c} value={c}>{CONNECTOR_SHORT[c]}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="minKw" className="mb-1 block text-xs font-medium text-ink-600">Minimum power</label>
          <Select id="minKw" name="minKw" defaultValue={sp.get("minKw") ?? ""}>
            <option value="">Any power</option>
            {[3.3, 7, 11, 22, 30].map((k) => <option key={k} value={k}>{k}+ kW</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="maxPrice" className="mb-1 block text-xs font-medium text-ink-600">Max price per hour (₹)</label>
          <Input id="maxPrice" name="maxPrice" type="number" min={10} step={10} defaultValue={sp.get("maxPrice") ?? ""} placeholder="e.g. 150" />
        </div>
        <div>
          <label htmlFor="access" className="mb-1 block text-xs font-medium text-ink-600">Access type</label>
          <Select id="access" name="access" defaultValue={sp.get("access") ?? ""}>
            <option value="">Any access</option>
            {Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-ink-600">Available on</label>
          <Input id="date" name="date" type="date" defaultValue={sp.get("date") ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="time" className="mb-1 block text-xs font-medium text-ink-600">From</label>
            <Input id="time" name="time" type="time" step={1800} defaultValue={sp.get("time") ?? "18:00"} />
          </div>
          <div>
            <label htmlFor="dur" className="mb-1 block text-xs font-medium text-ink-600">For</label>
            <Select id="dur" name="dur" defaultValue={sp.get("dur") ?? "60"}>
              {[60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="instant" value="1" defaultChecked={sp.get("instant") === "1"} className="size-4 accent-volt-600" />
          Instant book only
        </label>
        <label className={cn("flex items-center gap-2 text-sm", !hasVehicle && "text-ink-400")}>
          <input type="checkbox" name="compat" value="1" disabled={!hasVehicle} defaultChecked={sp.get("compat") === "1"} className="size-4 accent-volt-600" />
          Compatible with my vehicle
          {!hasVehicle ? <span className="text-xs">({signedIn ? "add one in Account" : "sign in"})</span> : null}
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={() => { setOpen(false); router.push("/chargers"); }}>
            <X className="size-4" aria-hidden /> Clear
          </Button>
          <Button type="submit">Apply filters</Button>
        </div>
      </div>
    </form>
  );
}
