"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export function ApproxMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="relative h-full w-full">
      <MapView pins={[]} center={{ lat, lng }} zoom={14} className="h-full w-full" />
      <ApproxCircle />
    </div>
  );
}

function ApproxCircle() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center">
      <div className="size-28 rounded-full border-2 border-volt-500 bg-volt-500/15" />
      <span className="absolute bottom-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-ink-600">Approximate area</span>
    </div>
  );
}
