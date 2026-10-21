import { AppError } from "@/lib/errors";
import { approximate, haversineKm } from "@/lib/geo";
import { rupeesToPaise } from "@/lib/money";
import type { ListingInput } from "@/lib/validation";
import { slotProblem, type AvailabilityRule, type Interval } from "@/lib/domain/availability";
import { zonedToUtc } from "@/lib/domain/time";
import { ACTIVE_STATUSES } from "@/lib/domain/booking-state";
import { checkCompatibility } from "@/lib/domain/compat";
import { audit, requireActive, requireRole, type Actor, type Db, type Queryable } from "./common";

export const LISTING_CHECKS = ["property_permission", "charger_spec", "installation_evidence", "electrical_safety"] as const;

export interface PublicListing {
  id: string;
  title: string;
  description: string;
  property_type: string;
  connector_type: string;
  connector_label: string;
  current: "AC" | "DC";
  charger_make: string;
  charger_model: string;
  rated_power_kw: number;
  locality: string;
  city: string;
  approx_lat: number;
  approx_lng: number;
  access_type: string;
  parking_details: string;
  restrictions: string;
  amenities: string[];
  supported_vehicle_notes: string;
  price_per_hour_paise: number;
  booking_fee_paise: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  buffer_minutes: number;
  cancellation_policy: "flexible" | "moderate" | "strict";
  instant_book: boolean;
  is_demo: boolean;
  host_id: string;
  host_display_name: string;
  host_type: string;
  review_count: number;
  avg_rating: number | null;
  photo_path: string | null;
  distance_km?: number;
}

const PUBLIC_SELECT = `
  select pl.*, ct.label as connector_label, ct.current::text as current,
         coalesce(rv.n, 0)::int as review_count, rv.avg as avg_rating,
         (select storage_path from public.charger_photos p where p.listing_id = pl.id and p.kind = 'listing'
           order by sort_order, created_at limit 1) as photo_path
    from public.public_listings pl
    join public.connector_types ct on ct.code = pl.connector_type
    left join (select listing_id, count(*) as n, round(avg(rating)::numeric, 1) as avg
                 from public.reviews where not is_hidden group by listing_id) rv on rv.listing_id = pl.id`;

export interface SearchFilters {
  center?: { lat: number; lng: number } | null;
  radiusKm?: number;
  connector?: string | null;
  minKw?: number | null;
  maxPricePerHour?: number | null; // rupees
  access?: string | null;
  instantOnly?: boolean;
  vehicle?: { connectors: string[]; maxAcKw: number | null; batteryKwh: number | null } | null;
  availableAt?: { date: string; startTime: string; durationMinutes: number } | null;
}

export async function searchListings(db: Db, f: SearchFilters, now = new Date()): Promise<PublicListing[]> {
  const { rows } = await db.query<PublicListing>(`${PUBLIC_SELECT} order by pl.title`);
  let out = rows;
  if (f.connector) out = out.filter((l) => l.connector_type === f.connector);
  if (f.minKw) out = out.filter((l) => l.rated_power_kw >= f.minKw!);
  if (f.maxPricePerHour) out = out.filter((l) => l.price_per_hour_paise <= rupeesToPaise(f.maxPricePerHour!));
  if (f.access) out = out.filter((l) => l.access_type === f.access);
  if (f.instantOnly) out = out.filter((l) => l.instant_book);
  if (f.vehicle) {
    const v = f.vehicle;
    out = out.filter(
      (l) =>
        checkCompatibility(v, { connectorType: l.connector_type, current: l.current, ratedPowerKw: l.rated_power_kw })
          .compatible,
    );
  }
  if (f.center) {
    out = out
      .map((l) => ({ ...l, distance_km: Math.round(haversineKm(f.center!, { lat: l.approx_lat, lng: l.approx_lng }) * 10) / 10 }))
      .filter((l) => !f.radiusKm || l.distance_km! <= f.radiusKm)
      .sort((a, b) => a.distance_km! - b.distance_km!);
  }
  if (f.availableAt) {
    const ok: PublicListing[] = [];
    for (const l of out) {
      const ctx = await availabilityContext(db, l.id);
      const start = zonedToUtc(f.availableAt.date, f.availableAt.startTime, ctx.policy.timeZone);
      const end = new Date(start.getTime() + f.availableAt.durationMinutes * 60000);
      if (!slotProblem({ start, end }, ctx.policy, ctx.rules, ctx.blocked, ctx.busy, now)) ok.push(l);
    }
    out = ok;
  }
  return out;
}

export async function getPublicListing(db: Db, id: string): Promise<PublicListing | null> {
  const { rows } = await db.query<PublicListing>(`${PUBLIC_SELECT} where pl.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function availabilityContext(q: Queryable, listingId: string, excludeBookingId?: string) {
  const { rows: l } = await q.query<{
    timezone: string;
    min_duration_minutes: number;
    max_duration_minutes: number;
    buffer_minutes: number;
    advance_notice_minutes: number;
  }>(
    "select timezone, min_duration_minutes, max_duration_minutes, buffer_minutes, advance_notice_minutes from public.charger_listings where id = $1",
    [listingId],
  );
  if (!l[0]) throw new AppError("not_found", "Charger not found.");
  const { rows: rules } = await q.query<AvailabilityRule>(
    "select weekday, to_char(start_time, 'HH24:MI') as start_time, case when end_time = '23:59:59' then '24:00' else to_char(end_time, 'HH24:MI') end as end_time from public.availability_rules where listing_id = $1",
    [listingId],
  );
  const { rows: blocked } = await q.query<{ start_at: Date; end_at: Date }>(
    "select start_at, end_at from public.blocked_times where listing_id = $1 and end_at > now() - interval '1 day'",
    [listingId],
  );
  const { rows: busy } = await q.query<{ start_at: Date; block_end_at: Date }>(
    `select start_at, block_end_at from public.bookings
      where listing_id = $1 and status = any($2::booking_status[]) and id is distinct from $3
        and not (status = 'pending_payment' and hold_expires_at < now())`,
    [listingId, ACTIVE_STATUSES, excludeBookingId ?? null],
  );
  return {
    policy: {
      timeZone: l[0].timezone,
      minDurationMinutes: l[0].min_duration_minutes,
      maxDurationMinutes: l[0].max_duration_minutes,
      bufferMinutes: l[0].buffer_minutes,
      advanceNoticeMinutes: l[0].advance_notice_minutes,
    },
    rules,
    blocked: blocked.map((b): Interval => ({ start: new Date(b.start_at), end: new Date(b.end_at) })),
    busy: busy.map((b): Interval => ({ start: new Date(b.start_at), end: new Date(b.block_end_at) })),
  };
}

// ---------------------------------------------------------------------------
// Host-side
// ---------------------------------------------------------------------------

async function assertConnector(q: Queryable, code: string, kw: number) {
  const { rows } = await q.query<{ listable: boolean; max_kw: number; label: string }>(
    "select listable, max_kw, label from public.connector_types where code = $1",
    [code],
  );
  if (!rows[0]) throw new AppError("invalid", "Unknown connector type.");
  if (!rows[0].listable) {
    throw new AppError(
      "invalid",
      `${rows[0].label} cannot be listed. ChargeShare only accepts certified EV chargers installed by a qualified electrician.`,
    );
  }
  if (kw > rows[0].max_kw) throw new AppError("invalid", `${rows[0].label} chargers are rated up to ${rows[0].max_kw} kW.`);
}

function listingParams(i: ListingInput) {
  return [
    i.title, i.description, i.propertyType, i.connectorType, i.chargerMake, i.chargerModel, i.ratedPowerKw,
    i.addressLine, i.lat, i.lng, i.accessInstructions, i.locality, i.city, i.pincode, i.accessType,
    i.parkingDetails, i.restrictions, i.amenities, i.supportedVehicleNotes, rupeesToPaise(i.pricePerHour),
    rupeesToPaise(i.bookingFee), i.minDurationMinutes, i.maxDurationMinutes, i.bufferMinutes,
    i.advanceNoticeMinutes, i.cancellationPolicy, i.instantBook,
  ];
}

async function replaceAvailability(q: Queryable, listingId: string, rules: ListingInput["availability"]) {
  await q.query("delete from public.availability_rules where listing_id = $1", [listingId]);
  for (const r of rules) {
    await q.query("insert into public.availability_rules (listing_id, weekday, start_time, end_time) values ($1, $2, $3, $4)", [
      listingId,
      r.weekday,
      r.start,
      r.end === "24:00" ? "23:59:59" : r.end,
    ]);
  }
}

export async function assertHostOwnsListing(q: Queryable, actor: Actor, listingId: string) {
  const { rows } = await q.query<{ host_id: string; status: string }>(
    "select host_id, status from public.charger_listings where id = $1",
    [listingId],
  );
  // Same error for "missing" and "not yours" so ids cannot be probed.
  if (!rows[0] || rows[0].host_id !== actor.userId) throw new AppError("not_found", "Listing not found.");
  return rows[0];
}

export async function createListing(db: Db, actor: Actor | null, input: ListingInput) {
  requireRole(actor, "host");
  requireActive(actor);
  return db.tx(async (q) => {
    const { rows: hp } = await q.query("select 1 from public.host_profiles where user_id = $1", [actor.userId]);
    if (!hp[0]) throw new AppError("invalid", "Create your host profile first.");
    await assertConnector(q, input.connectorType, input.ratedPowerKw);
    const id = crypto.randomUUID();
    const approx = approximate(input.lat, input.lng, id);
    await q.query(
      `insert into public.charger_listings (
         id, host_id, status, title, description, property_type, connector_type, charger_make, charger_model, rated_power_kw,
         address_line, lat, lng, access_instructions, locality, city, pincode, access_type, parking_details, restrictions,
         amenities, supported_vehicle_notes, price_per_hour_paise, booking_fee_paise, min_duration_minutes,
         max_duration_minutes, buffer_minutes, advance_notice_minutes, cancellation_policy, instant_book, approx_lat, approx_lng)
       values ($28, $29, 'draft', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
               $20, $21, $22, $23, $24, $25, $26, $27, $30, $31)`,
      [...listingParams(input), id, actor.userId, approx.lat, approx.lng],
    );
    await replaceAvailability(q, id, input.availability);
    for (const check of LISTING_CHECKS) {
      await q.query(
        "insert into public.charger_verifications (host_id, listing_id, check_type) values ($1, $2, $3)",
        [actor.userId, id, check],
      );
    }
    return id;
  });
}

const SPEC_FIELDS = ["connector_type", "rated_power_kw", "charger_make", "charger_model", "address_line", "lat", "lng"] as const;

export async function updateListing(db: Db, actor: Actor | null, listingId: string, input: ListingInput) {
  requireRole(actor, "host");
  requireActive(actor);
  return db.tx(async (q) => {
    const owned = await assertHostOwnsListing(q, actor, listingId);
    if (owned.status === "suspended") throw new AppError("forbidden", "Suspended listings cannot be edited. Contact support.");
    await assertConnector(q, input.connectorType, input.ratedPowerKw);
    const { rows: before } = await q.query<Record<string, unknown>>(
      `select ${SPEC_FIELDS.join(", ")} from public.charger_listings where id = $1`,
      [listingId],
    );
    const params = listingParams(input);
    const approx = approximate(input.lat, input.lng, listingId);
    await q.query(
      `update public.charger_listings set
         title = $1, description = $2, property_type = $3, connector_type = $4, charger_make = $5, charger_model = $6,
         rated_power_kw = $7, address_line = $8, lat = $9, lng = $10, access_instructions = $11, locality = $12, city = $13,
         pincode = $14, access_type = $15, parking_details = $16, restrictions = $17, amenities = $18,
         supported_vehicle_notes = $19, price_per_hour_paise = $20, booking_fee_paise = $21, min_duration_minutes = $22,
         max_duration_minutes = $23, buffer_minutes = $24, advance_notice_minutes = $25, cancellation_policy = $26,
         instant_book = $27, approx_lat = $29, approx_lng = $30
       where id = $28`,
      [...params, listingId, approx.lat, approx.lng],
    );
    const b = before[0];
    const specChanged =
      b.connector_type !== input.connectorType ||
      Number(b.rated_power_kw) !== input.ratedPowerKw ||
      b.charger_make !== input.chargerMake ||
      b.charger_model !== input.chargerModel ||
      b.address_line !== input.addressLine ||
      Math.abs(Number(b.lat) - input.lat) > 1e-6 ||
      Math.abs(Number(b.lng) - input.lng) > 1e-6;
    if (specChanged) {
      // Changed hardware or location must be re-verified before the listing can stay live.
      await q.query(
        `update public.charger_verifications set status = 'pending_review', decision_reason = 'Re-review: listing specs changed', reviewed_at = null, reviewed_by = null
          where listing_id = $1 and check_type in ('charger_spec', 'property_permission', 'installation_evidence') and status <> 'not_submitted'`,
        [listingId],
      );
      if (["active", "paused"].includes(owned.status)) {
        await q.query("update public.charger_listings set status = 'pending_review' where id = $1", [listingId]);
      }
    }
    await replaceAvailability(q, listingId, input.availability);
    return { specChanged };
  });
}

export async function submitListingForReview(db: Db, actor: Actor | null, listingId: string) {
  requireRole(actor, "host");
  requireActive(actor);
  return db.tx(async (q) => {
    const owned = await assertHostOwnsListing(q, actor, listingId);
    if (!["draft", "changes_requested", "rejected"].includes(owned.status)) {
      throw new AppError("invalid", "This listing is already under review or live.");
    }
    const { rows } = await q.query<{ check_type: string; status: string }>(
      `select check_type::text, status::text from public.charger_verifications
        where (listing_id = $1) or (host_id = $2 and check_type = 'identity')`,
      [listingId, actor.userId],
    );
    const missing = rows.filter((r) => r.status === "not_submitted").map((r) => r.check_type);
    if (!rows.some((r) => r.check_type === "identity")) missing.push("identity");
    if (missing.length) {
      throw new AppError("invalid", `Submit all verification items first (missing: ${missing.join(", ").replace(/_/g, " ")}).`);
    }
    await q.query("update public.charger_listings set status = 'pending_review' where id = $1", [listingId]);
  });
}

export async function setListingPaused(db: Db, actor: Actor | null, listingId: string, paused: boolean) {
  requireRole(actor, "host");
  return db.tx(async (q) => {
    const owned = await assertHostOwnsListing(q, actor, listingId);
    if (paused) {
      if (owned.status !== "active") throw new AppError("invalid", "Only live listings can be paused.");
      await q.query("update public.charger_listings set status = 'paused' where id = $1", [listingId]);
    } else {
      if (owned.status !== "paused") throw new AppError("invalid", "Only paused listings can be resumed.");
      const { rows } = await q.query<{ ok: boolean; approved_at: Date | null }>(
        "select public.listing_checks_complete($1) as ok, approved_at from public.charger_listings where id = $1",
        [listingId],
      );
      if (!rows[0].ok || !rows[0].approved_at) {
        throw new AppError("invalid", "This listing needs to pass verification again before it can go live.");
      }
      await q.query("update public.charger_listings set status = 'active' where id = $1", [listingId]);
    }
    await audit(q, actor.userId, paused ? "listing.pause" : "listing.resume", "listing", listingId);
  });
}

export async function addBlockedTime(
  db: Db,
  actor: Actor | null,
  listingId: string,
  start: Date,
  end: Date,
  reason: string,
) {
  requireRole(actor, "host");
  if (!(end > start)) throw new AppError("invalid", "End must be after start.");
  return db.tx(async (q) => {
    await assertHostOwnsListing(q, actor, listingId);
    await q.query("insert into public.blocked_times (listing_id, start_at, end_at, reason) values ($1, $2, $3, $4)", [
      listingId,
      start,
      end,
      reason.slice(0, 200),
    ]);
  });
}

export async function removeBlockedTime(db: Db, actor: Actor | null, blockedId: string) {
  requireRole(actor, "host");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ listing_id: string }>("select listing_id from public.blocked_times where id = $1", [blockedId]);
    if (!rows[0]) throw new AppError("not_found", "Not found.");
    await assertHostOwnsListing(q, actor, rows[0].listing_id);
    await q.query("delete from public.blocked_times where id = $1", [blockedId]);
  });
}

export async function addListingPhoto(
  db: Db,
  actor: Actor | null,
  listingId: string,
  storagePath: string,
  kind: "listing" | "installation",
) {
  requireRole(actor, "host");
  return db.tx(async (q) => {
    await assertHostOwnsListing(q, actor, listingId);
    await q.query(
      "insert into public.charger_photos (listing_id, storage_path, kind, sort_order) values ($1, $2, $3, (select count(*) from public.charger_photos where listing_id = $1))",
      [listingId, storagePath, kind],
    );
  });
}

export async function removeListingPhoto(db: Db, actor: Actor | null, photoId: string) {
  requireRole(actor, "host");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ listing_id: string }>("select listing_id from public.charger_photos where id = $1", [photoId]);
    if (!rows[0]) throw new AppError("not_found", "Not found.");
    await assertHostOwnsListing(q, actor, rows[0].listing_id);
    await q.query("delete from public.charger_photos where id = $1", [photoId]);
  });
}

export async function upsertHostProfile(
  db: Db,
  actor: Actor | null,
  input: { hostType: string; displayName: string; bio: string; contactPhone: string },
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  requireActive(actor);
  return db.tx(async (q) => {
    await q.query("insert into public.user_roles (user_id, role) values ($1, 'host') on conflict do nothing", [actor.userId]);
    await q.query(
      `insert into public.host_profiles (user_id, host_type, display_name, bio, contact_phone) values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set host_type = excluded.host_type, display_name = excluded.display_name,
         bio = excluded.bio, contact_phone = excluded.contact_phone`,
      [actor.userId, input.hostType, input.displayName, input.bio, input.contactPhone],
    );
    await q.query(
      `insert into public.charger_verifications (host_id, check_type) values ($1, 'identity')
       on conflict (host_id) where check_type = 'identity' do nothing`,
      [actor.userId],
    );
  });
}

/** Saves the host's safety-checklist acknowledgements (self-declared, not a verification). */
export async function saveSafetyChecklist(db: Db, actor: Actor | null, checklist: Record<string, boolean>) {
  requireRole(actor, "host");
  await db.query("update public.host_profiles set safety_checklist = $1 where user_id = $2", [
    JSON.stringify(checklist),
    actor.userId,
  ]);
}

export async function zonedSlot(q: Queryable, listingId: string, date: string, startTime: string, minutes: number) {
  const ctx = await availabilityContext(q, listingId);
  const start = zonedToUtc(date, startTime, ctx.policy.timeZone);
  return { ctx, start, end: new Date(start.getTime() + minutes * 60000) };
}
