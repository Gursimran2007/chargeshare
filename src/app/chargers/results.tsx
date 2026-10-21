"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { List, Map as MapIcon, Info } from "lucide-react";
import { ListingCard, type ListingCardData } from "@/components/domain";
import { Skeleton, cn } from "@/components/ui";
import { formatINR } from "@/lib/money";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export function Results({
  listings,
  center,
}: {
  listings: (ListingCardData & { approx_lat: number; approx_lng: number })[];
  center: { lat: number; lng: number };
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const [active, setActive] = useState<string | null>(null);
  const pins = listings.map((l) => ({
    id: l.id,
    lat: l.approx_lat,
    lng: l.approx_lng,
    label: formatINR(l.price_per_hour_paise),
    title: l.title,
  }));
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
      <div className={cn(view === "map" && "hidden lg:block")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {listings.map((l) => (
            <div key={l.id} onMouseEnter={() => setActive(l.id)} onMouseLeave={() => setActive(null)}>
              <ListingCard l={l} compact />
            </div>
          ))}
        </div>
      </div>
      <div className={cn("lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-8rem)]", view === "list" ? "hidden" : "block h-[70vh]")}>
        <div className="relative h-full overflow-hidden rounded-2xl border border-ink-100">
          <MapView key={pins.map((p) => p.id).join()} pins={pins} center={center} activeId={active} onHover={setActive} className="h-full w-full" />
          <div className="pointer-events-none absolute left-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-ink-600 shadow">
            <Info className="size-3.5" aria-hidden /> Pins show approximate areas
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setView((v) => (v === "list" ? "map" : "list"))}
        className="fixed bottom-20 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-lift lg:hidden"
      >
        {view === "list" ? <><MapIcon className="size-4" aria-hidden /> Map</> : <><List className="size-4" aria-hidden /> List</>}
      </button>
    </div>
  );
}
