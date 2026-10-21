import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { Container, EmptyState, LinkButton } from "@/components/ui";
import { Filters } from "./filters";
import { Results } from "./results";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { searchListings, type SearchFilters } from "@/lib/services/listings";
import { CITY_CENTER, findLocality, LOCALITIES } from "@/lib/geo";
import { config } from "@/lib/config";
import { visitorId } from "@/lib/request";
import { track } from "@/lib/services/analytics";

export const metadata = { title: "Find a charger" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: string | string[] | undefined) => {
  const n = Number(str(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default async function ChargersPage({ searchParams }: PageProps<"/chargers">) {
  const sp = await searchParams;
  const db = await getDb();
  const viewer = await getViewer();
  const { rows: vehicles } = viewer
    ? await db.query<{ connectors: string[]; max_ac_kw: number | null; battery_kwh: number | null }>(
        "select connectors, max_ac_kw, battery_kwh from public.vehicles where owner_id = $1 order by is_default desc limit 1",
        [viewer.userId],
      )
    : { rows: [] };
  const q = str(sp.q);
  const locality = q ? findLocality(q) : null;
  const lat = num(sp.lat);
  const lng = num(sp.lng);
  const center = lat && lng ? { lat, lng } : locality ?? null;
  const date = str(sp.date);
  const filters: SearchFilters = {
    center,
    radiusKm: center ? 12 : undefined,
    connector: str(sp.connector),
    minKw: num(sp.minKw),
    maxPricePerHour: num(sp.maxPrice),
    access: str(sp.access),
    instantOnly: sp.instant === "1",
    vehicle: sp.compat === "1" && vehicles[0] ? { connectors: vehicles[0].connectors, maxAcKw: vehicles[0].max_ac_kw, batteryKwh: vehicles[0].battery_kwh } : null,
    availableAt: date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? { date, startTime: /^\d{2}:\d{2}$/.test(str(sp.time) ?? "") ? str(sp.time)! : "18:00", durationMinutes: num(sp.dur) ?? 60 }
      : null,
  };
  const listings = await searchListings(db, filters);
  await track(db, "search", {
    visitorId: await visitorId(),
    userId: viewer?.userId,
    props: { q, locality: locality?.name ?? null, results: listings.length, filtered: !!(filters.connector || filters.minKw || filters.maxPricePerHour || filters.access || filters.instantOnly || filters.vehicle || filters.availableAt) },
    isDemo: config.demoMode,
  });
  return (
    <Container className="py-6 sm:py-8">
      <datalist id="localities">
        {LOCALITIES.map((l) => <option key={l.name} value={l.name} />)}
      </datalist>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {center ? `Chargers near ${locality?.name ?? "you"}` : "Chargers in Chennai"}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {listings.length} {listings.length === 1 ? "charger" : "chargers"}
          {q && !locality ? ` · we couldn't place "${q}", showing all of Chennai` : ""}
          {config.demoMode ? " · fictional demo listings" : ""}
        </p>
      </div>
      <div className="mb-6">
        <Suspense>
          <Filters hasVehicle={vehicles.length > 0} signedIn={!!viewer} />
        </Suspense>
      </div>
      {listings.length ? (
        <Results listings={listings} center={center ?? CITY_CENTER} />
      ) : (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="No chargers match these filters"
          body="Try a wider area, a different time, or fewer filters. New hosts are being onboarded across Chennai."
          action={<LinkButton href="/chargers" variant="outline">Clear filters</LinkButton>}
        />
      )}
    </Container>
  );
}
