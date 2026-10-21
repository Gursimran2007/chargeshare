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

const PALETTES = [
  ["#0a1730", "#12385a", "#0fb5ae"],
  ["#0d1f3a", "#1f4a6b", "#2fd3c9"],
  ["#111c33", "#2a3f66", "#7ce8e0"],
  ["#0b1b33", "#14455a", "#22c55e"],
];

/** Deterministic illustrated cover for listings without host photos. */
export function ListingArt({ seed, kind, className, kw }: { seed: string; kind: string; className?: string; kw?: number }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, mid, accent] = PALETTES[h % PALETTES.length];
  const towers = kind === "office" || kind === "hotel" || kind === "retail" || kind === "apartment";
  const id = `g${h}`;
  return (
    <svg viewBox="0 0 400 260" className={cn("h-full w-full", className)} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of an EV charger">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.55" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#${id}s)`} />
      {towers ? (
        <g fill="#ffffff" opacity="0.07">
          <rect x={20 + (h % 30)} y="40" width="70" height="170" />
          <rect x="110" y="70" width="60" height="140" />
          <rect x="290" y={30 + (h % 25)} width="80" height="180" />
        </g>
      ) : (
        <g fill="#ffffff" opacity="0.08">
          <path d="M30 210V120l70-50 70 50v90Z" />
          <path d="M260 210v-70l55-40 55 40v70Z" />
        </g>
      )}
      <g fill="#ffffff" opacity="0.25">
        {[...Array(6)].map((_, i) => (
          <circle key={i} cx={(h >> i) % 400} cy={(h >> (i + 3)) % 90} r="1.2" />
        ))}
      </g>
      <rect x="0" y="208" width="400" height="52" fill="#071226" opacity="0.65" />
      <g stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeDasharray="14 12">
        <line x1="60" y1="236" x2="340" y2="236" />
      </g>
      <circle cx="232" cy="140" r="90" fill={`url(#${id}g)`} />
      <g>
        <rect x="212" y="96" width="44" height="114" rx="10" fill="#f5f7fa" />
        <rect x="220" y="108" width="28" height="18" rx="4" fill={bg} />
        <rect x="224" y="112" width="12" height="3" rx="1.5" fill={accent} />
        <path d="M236 140l-7 11h6l-2 9 9-12h-6l2-8z" fill={accent} />
        <path d="M256 150c30 0 34 30 52 48" stroke="#f5f7fa" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="300" y="190" width="18" height="12" rx="3" fill="#f5f7fa" />
      </g>
      {kw ? (
        <g>
          <rect x="18" y="18" rx="12" width="86" height="26" fill="#ffffff" fillOpacity="0.12" />
          <text x="61" y="36" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="600" fontFamily="sans-serif">
            {kw} kW
          </text>
        </g>
      ) : null}
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
      className="group block overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
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
