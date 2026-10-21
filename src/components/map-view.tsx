"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useRouter } from "next/navigation";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Leaflet map with price pins. Pins are approximate locations; the exact
 * address is released only after a booking is confirmed.
 */
export function MapView({
  pins,
  center,
  zoom = 12,
  activeId,
  onHover,
  circle,
  className,
}: {
  pins: MapPin[];
  center: { lat: number; lng: number };
  zoom?: number;
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  circle?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const markerMap = markers.current;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: true }).setView([center.lat, center.lng], zoom);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(m);
      map.current = m;
      for (const p of pins) {
        if (circle) {
          L.circle([p.lat, p.lng], { radius: 450, color: "#0fb5ae", weight: 1, fillOpacity: 0.12 }).addTo(m);
        }
        const icon = L.divIcon({ className: "", html: `<span class="cs-pin" data-id="${p.id}">${p.label}</span>`, iconSize: [0, 0] });
        const mk = L.marker([p.lat, p.lng], { icon, title: p.title, keyboard: true, riseOnHover: true }).addTo(m);
        mk.on("click", () => router.push(`/chargers/${p.id}`));
        mk.on("mouseover", () => onHover?.(p.id));
        mk.on("mouseout", () => onHover?.(null));
        markerMap.set(p.id, mk);
      }
      if (pins.length > 1 && !circle) {
        m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 });
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markerMap.clear();
    };
    // Pins are keyed by the page's search params; a new search remounts the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markers.current.forEach((mk, id) => {
      const node = mk.getElement()?.querySelector(".cs-pin");
      node?.classList.toggle("is-active", id === activeId);
      if (id === activeId) mk.setZIndexOffset(1000);
      else mk.setZIndexOffset(0);
    });
  }, [activeId]);

  return <div ref={el} className={className} role="region" aria-label="Map of chargers (approximate locations)" />;
}
