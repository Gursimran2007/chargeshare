import Link from "next/link";
import { BadgeCheck, Clock3, FlaskConical, MapPin, ShieldAlert, Star, Zap } from "lucide-react";
import { Badge, cn } from "./ui";
import { STATUS_LABEL, type BookingStatus } from "@/lib/domain/booking-state";
import { formatINR } from "@/lib/money";
import { ACCESS_LABEL, CONNECTOR_SHORT, LISTING_STATUS_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import { brand } from "@/lib/brand";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-semibold", light ? "text-white" : "text-ink-900", className)}>
      <span className="relative grid size-8 place-items-center rounded-xl bg-ink-900 text-volt-400 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
          <path d="M13.5 2 5 13.2h5.6L9.5 22 19 9.8h-5.7L13.5 2Z" />
        </svg>
      </span>
      {brand.name}
    </span>
  );
}

const BOOKING_TONE: Record<BookingStatus, "neutral" | "volt" | "go" | "warn" | "stop" | "ink"> = {
  requested: "warn",
  pending_payment: "warn",
  confirmed: "volt",
  checked_in: "volt",
  in_progress: "go",
  completed: "go",
  declined: "neutral",
  expired: "neutral",
  cancelled: "neutral",
  disputed: "stop",
  refunded: "neutral",
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function ListingStatusPill({ status }: { status: string }) {
  const tone = status === "active" ? "go" : status === "suspended" || status === "rejected" ? "stop" : status === "draft" || status === "paused" ? "neutral" : "warn";
  return <Badge tone={tone}>{LISTING_STATUS_LABEL[status] ?? status}</Badge>;
}

export function VerificationPill({ status, simulated }: { status: string; simulated?: boolean }) {
  const tone = status === "verified" ? "go" : status === "rejected" || status === "suspended" ? "stop" : status === "not_submitted" ? "neutral" : "warn";
  return (
    <Badge tone={tone}>
      {VERIFICATION_LABEL[status] ?? status}
      {simulated ? " (simulated)" : ""}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="outline" className={cn("border-warn-600/30 bg-warn-100/60 text-warn-600", className)}>
      <FlaskConical className="size-3" aria-hidden /> Demo listing
    </Badge>
  );
}

/**
 * Trust signal shown on listings. Demo listings never claim real verification:
 * their checks are simulated and labelled as such.
 */
export function TrustBadge({ isDemo }: { isDemo: boolean }) {
  if (isDemo) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500">
        <ShieldAlert className="size-3.5 text-warn-600" aria-hidden /> Fictional listing · checks simulated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-go-600">
      <BadgeCheck className="size-3.5" aria-hidden /> 5 checks approved by ChargeShare
    </span>
  );
}

export function Rating({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg === null) return <span className="shrink-0 whitespace-nowrap text-xs font-medium text-ink-500">New</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-ink-900">
      <Star className="size-3.5 fill-ink-900" aria-hidden /> {avg.toFixed(1)}
      <span className="font-normal text-ink-500">({count})</span>
    </span>
  );
}

const PALETTES = ["#0a1730", "#0f2140", "#12223f", "#0c1b2e"];

/**
 * Deterministic architectural cover for listings without host photos: a flat,
 * restrained drawing of the property type and a wall-mounted charger. Real host
 * photos replace it as soon as they are uploaded.
 */
export function ListingArt({ seed, kind, className }: { seed: string; kind: string; className?: string }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = PALETTES[h % PALETTES.length];
  const line = "#ffffff";
  const building =
    kind === "office" || kind === "retail" ? (
      <g fill="none" stroke={line} strokeOpacity="0.16" strokeWidth="2">
        <rect x="40" y="40" width="150" height="160" />
        {[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={56 + c * 34} y={56 + r * 28} width="20" height="14" />))}
      </g>
    ) : kind === "hotel" || kind === "apartment" ? (
      <g fill="none" stroke={line} strokeOpacity="0.16" strokeWidth="2">
        <rect x="30" y="30" width="110" height="170" />
        <rect x="150" y="70" width="70" height="130" />
        {[0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={44 + c * 32} y={44 + r * 25} width="18" height="12" />))}
      </g>
    ) : (
      <g fill="none" stroke={line} strokeOpacity="0.16" strokeWidth="2">
        <path d="M40 200V118l80-56 80 56v82" />
        <rect x="70" y="140" width="34" height="60" />
        <rect x="130" y="138" width="40" height="30" />
      </g>
    );
  return (
    <svg viewBox="0 0 400 260" className={cn("h-full w-full", className)} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of the charging location">
      <rect width="400" height="260" fill={bg} />
      {building}
      <rect x="0" y="200" width="400" height="60" fill="#071226" />
      <g stroke="#ffffff" strokeOpacity="0.28" strokeWidth="2">
        <line x1="250" y1="212" x2="250" y2="260" />
        <line x1="370" y1="212" x2="370" y2="260" />
      </g>
      <g>
        <rect x="282" y="104" width="40" height="96" rx="6" fill="#e9eef3" />
        <rect x="289" y="114" width="26" height="14" rx="2" fill={bg} />
        <rect x="292" y="119" width="10" height="3" rx="1.5" fill="#2fd3c9" />
        <path d="M303 140l-6 10h5l-2 8 8-11h-5l2-7z" fill="#0fb5ae" />
        <path d="M322 160c22 0 26 24 34 40" stroke="#e9eef3" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export interface ListingCardData {
  id: string;
  title: string;
  locality: string;
  connector_type: string;
  rated_power_kw: number;
  price_per_hour_paise: number;
  access_type: string;
  property_type: string;
  instant_book: boolean;
  is_demo: boolean;
  review_count: number;
  avg_rating: number | null;
  photo_path: string | null;
  distance_km?: number;
}

export function ListingPhoto({ l, className }: { l: Pick<ListingCardData, "id" | "photo_path" | "property_type" | "rated_power_kw" | "title">; className?: string }) {
  if (l.photo_path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${l.photo_path}`} alt={l.title} className={cn("h-full w-full object-cover", className)} />;
  }
  return <ListingArt seed={l.id} kind={l.property_type} className={className} />;
}

export function ListingCard({ l, href, compact }: { l: ListingCardData; href?: string; compact?: boolean }) {
  return (
    <Link
      href={href ?? `/chargers/${l.id}`}
      className="group block overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className={cn("relative overflow-hidden bg-ink-900", compact ? "aspect-[16/9]" : "aspect-[16/10]")}>
        <ListingPhoto l={l} className="transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex gap-1.5">{l.is_demo ? <DemoBadge /> : null}</div>
        {l.instant_book ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink-900">
            <Zap className="size-3 text-volt-600" aria-hidden /> Instant
          </span>
        ) : (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink-900">
            <Clock3 className="size-3 text-warn-600" aria-hidden /> Request
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink-900">{l.title}</h3>
          <Rating avg={l.avg_rating} count={l.review_count} />
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-sm text-ink-500">
          <MapPin className="size-3.5" aria-hidden /> {l.locality}
          {l.distance_km !== undefined ? <span>· {l.distance_km} km</span> : null}
          <span>· {ACCESS_LABEL[l.access_type]}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <Badge tone="volt">{CONNECTOR_SHORT[l.connector_type] ?? l.connector_type}</Badge>
            <Badge>{l.rated_power_kw} kW</Badge>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-ink-900">{formatINR(l.price_per_hour_paise)}</span>
            <span className="text-ink-500"> / hr</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
