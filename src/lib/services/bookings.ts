import { randomBytes } from "node:crypto";
import { AppError, pgCode } from "@/lib/errors";
import { quotePrice, type PriceQuote } from "@/lib/domain/pricing";
import { slotProblem } from "@/lib/domain/availability";
import { zonedToUtc } from "@/lib/domain/time";
import { checkCompatibility, estimateCharge, type ChargeEstimate, type Compatibility } from "@/lib/domain/compat";
import { canTransition, type BookingStatus } from "@/lib/domain/booking-state";
import { refundForCancellation, type CancellationPolicy } from "@/lib/domain/cancellation";
import type { BookingRequest } from "@/lib/validation";
import type { PaymentProvider } from "@/lib/payments/types";
import { availabilityContext } from "./listings";
import { issueRefund } from "./payments";
import { audit, getSettingNumber, notify, requireActive, requireRole, type Actor, type Db, type Queryable } from "./common";

interface ListingRow {
  id: string;
  host_id: string;
  status: string;
  title: string;
  timezone: string;
  connector_type: string;
  current: "AC" | "DC";
  rated_power_kw: number;
  price_per_hour_paise: number;
  booking_fee_paise: number;
  buffer_minutes: number;
  cancellation_policy: CancellationPolicy;
  instant_book: boolean;
  is_demo: boolean;
}

interface VehicleRow {
  id: string;
  owner_id: string;
  connectors: string[];
  battery_kwh: number | null;
  max_ac_kw: number | null;
}

export interface BookingRow {
  id: string;
  code: string;
  listing_id: string;
  driver_id: string;
  host_id: string;
  status: BookingStatus;
  start_at: Date;
  end_at: Date;
  amount_paise: number;
  commission_paise: number;
  host_share_paise: number;
  cancellation_policy: CancellationPolicy;
  hold_expires_at: Date | null;
  completed_at: Date | null;
  end_at_plus?: Date;
}

export interface QuoteResult {
  start: Date;
  end: Date;
  problem: string | null;
  price: PriceQuote;
  compatibility: Compatibility | null;
  estimate: ChargeEstimate | null;
}

async function loadListing(q: Queryable, id: string, lock = false) {
  const { rows } = await q.query<ListingRow>(
    `select l.*, ct.current::text as current from public.charger_listings l
       join public.connector_types ct on ct.code = l.connector_type
      where l.id = $1 ${lock ? "for update of l" : ""}`,
    [id],
  );
  return rows[0] ?? null;
}

async function loadVehicle(q: Queryable, id: string | null | undefined, ownerId: string | null) {
  if (!id || !ownerId) return null;
  const { rows } = await q.query<VehicleRow>("select * from public.vehicles where id = $1 and owner_id = $2", [id, ownerId]);
  return rows[0] ?? null;
}

/** Price + availability check for a prospective booking. Read-only. */
export async function quoteBooking(
  q: Queryable,
  actorId: string | null,
  req: BookingRequest,
  now = new Date(),
): Promise<QuoteResult> {
  const listing = await loadListing(q, req.listingId);
  if (!listing || listing.status !== "active") throw new AppError("not_found", "This charger is not available for booking.");
  const ctx = await availabilityContext(q, listing.id);
  const start = zonedToUtc(req.date, req.startTime, listing.timezone);
  const end = new Date(start.getTime() + req.durationMinutes * 60000);
  const commissionBps = await getSettingNumber(q, "commission_bps");
  const price = quotePrice({
    pricePerHourPaise: listing.price_per_hour_paise,
    bookingFeePaise: listing.booking_fee_paise,
    durationMinutes: req.durationMinutes,
    commissionBps,
  });
  const vehicle = await loadVehicle(q, req.vehicleId, actorId);
  let compatibility: Compatibility | null = null;
  let estimate: ChargeEstimate | null = null;
  if (vehicle) {
    compatibility = checkCompatibility(
      { connectors: vehicle.connectors, batteryKwh: vehicle.battery_kwh, maxAcKw: vehicle.max_ac_kw },
      { connectorType: listing.connector_type, current: listing.current, ratedPowerKw: listing.rated_power_kw },
    );
    estimate = compatibility.compatible ? estimateCharge(compatibility.effectiveKw, req.durationMinutes, vehicle.battery_kwh) : null;
  }
  const problem = slotProblem({ start, end }, ctx.policy, ctx.rules, ctx.blocked, ctx.busy, now);
  return { start, end, problem, price, compatibility, estimate };
}

async function expireStale(q: Queryable, listingId: string, now: Date) {
  const { rows } = await q.query<{ id: string; status: BookingStatus; driver_id: string; code: string }>(
    `update public.bookings set status = 'expired'
      where listing_id = $1 and status in ('pending_payment', 'requested') and hold_expires_at < $2
        and not exists (select 1 from public.payments p where p.booking_id = bookings.id and p.status = 'captured')
      returning id, status, driver_id, code`,
    [listingId, now],
  );
  for (const r of rows) {
    await q.query(
      "insert into public.booking_events (booking_id, to_status, actor_role, note) values ($1, 'expired', 'system', 'Hold elapsed')",
      [r.id],
    );
  }
}

function bookingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return "CS-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Create a booking. Price, availability and compatibility are all decided here, on the server. */
export async function createBooking(db: Db, actor: Actor | null, req: BookingRequest, now = new Date()) {
  requireRole(actor, "driver");
  requireActive(actor);
  if (!req.vehicleId) throw new AppError("invalid", "Choose a vehicle so we can check compatibility.");
  try {
    return await db.tx(async (q) => {
      // Lock the listing row: bookings for one charger are serialised.
      const listing = await loadListing(q, req.listingId, true);
      if (!listing || listing.status !== "active") throw new AppError("not_found", "This charger is not available for booking.");
      if (listing.host_id === actor.userId) throw new AppError("invalid", "You cannot book your own charger.");
      const vehicle = await loadVehicle(q, req.vehicleId, actor.userId);
      if (!vehicle) throw new AppError("invalid", "Vehicle not found.");
      await expireStale(q, listing.id, now);
      const quote = await quoteBooking(q, actor.userId, req, now);
      if (!quote.compatibility?.compatible) {
        throw new AppError("invalid", quote.compatibility?.reasons[0] ?? "Your vehicle is not compatible with this charger.");
      }
      if (quote.problem) throw new AppError("unavailable", quote.problem);
      const holdMinutes = await getSettingNumber(q, "payment_hold_minutes");
      const responseHours = await getSettingNumber(q, "request_response_hours");
      const status: BookingStatus = listing.instant_book ? "pending_payment" : "requested";
      const holdUntil = listing.instant_book
        ? new Date(now.getTime() + holdMinutes * 60000)
        : new Date(Math.min(now.getTime() + responseHours * 3_600_000, quote.start.getTime()));
      const blockEnd = new Date(quote.end.getTime() + listing.buffer_minutes * 60000);
      const { rows } = await q.query<{ id: string; code: string }>(
        `insert into public.bookings (code, listing_id, driver_id, host_id, vehicle_id, status, start_at, end_at, block_end_at,
           duration_minutes, price_per_hour_paise, booking_fee_paise, amount_paise, commission_bps, commission_paise,
           host_share_paise, cancellation_policy, estimate, driver_note, hold_expires_at, is_demo, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         returning id, code`,
        [
          bookingCode(), listing.id, actor.userId, listing.host_id, vehicle.id, status, quote.start, quote.end, blockEnd,
          req.durationMinutes, listing.price_per_hour_paise, listing.booking_fee_paise, quote.price.amountPaise,
          quote.price.commissionBps, quote.price.commissionPaise, quote.price.hostSharePaise, listing.cancellation_policy,
          JSON.stringify({ compatibility: quote.compatibility, estimate: quote.estimate }), req.note ?? "", holdUntil,
          listing.is_demo, now,
        ],
      );
      const b = rows[0];
      await q.query(
        "insert into public.booking_events (booking_id, to_status, actor_id, actor_role, created_at) values ($1, $2, $3, 'driver', $4)",
        [b.id, status, actor.userId, now],
      );
      if (status === "requested") {
        await notify(q, listing.host_id, {
          type: "booking_request",
          title: `New booking request ${b.code}`,
          body: `Respond within ${responseHours} hours or the request expires.`,
          link: "/host/bookings",
          email: true,
        });
      }
      return { bookingId: b.id, code: b.code, status, amountPaise: quote.price.amountPaise };
    });
  } catch (e) {
    if (pgCode(e) === "23P01") throw new AppError("unavailable", "Someone just booked an overlapping slot. Please pick another time.");
    throw e;
  }
}

async function lockBooking(q: Queryable, id: string) {
  const { rows } = await q.query<BookingRow>("select * from public.bookings where id = $1 for update", [id]);
  if (!rows[0]) throw new AppError("not_found", "Booking not found.");
  return rows[0];
}

function roleIn(b: BookingRow, actor: Actor): "driver" | "host" | "admin" {
  if (b.driver_id === actor.userId) return "driver";
  if (b.host_id === actor.userId) return "host";
  if (actor.roles.includes("admin")) return "admin";
  throw new AppError("not_found", "Booking not found.");
}

async function transition(
  q: Queryable,
  b: BookingRow,
  to: BookingStatus,
  actor: Actor | null,
  role: string,
  note: string | null,
  extra: Record<string, unknown> = {},
) {
  if (!canTransition(b.status, to)) throw new AppError("invalid", `A ${b.status.replace("_", " ")} booking cannot become ${to.replace("_", " ")}.`);
  const sets = ["status = $2", ...Object.keys(extra).map((k, i) => `${k} = $${i + 3}`)];
  await q.query(`update public.bookings set ${sets.join(", ")} where id = $1`, [b.id, to, ...Object.values(extra)]);
  await q.query(
    "insert into public.booking_events (booking_id, from_status, to_status, actor_id, actor_role, note) values ($1, $2, $3, $4, $5, $6)",
    [b.id, b.status, to, actor?.userId ?? null, role, note],
  );
}

export async function respondToRequest(db: Db, actor: Actor | null, bookingId: string, accept: boolean, reason = "", now = new Date()) {
  requireRole(actor, "host");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    if (b.host_id !== actor.userId) throw new AppError("not_found", "Booking not found.");
    if (b.status !== "requested") throw new AppError("invalid", "This request has already been handled.");
    if (b.hold_expires_at && new Date(b.hold_expires_at) < now) throw new AppError("invalid", "This request has expired.");
    if (accept) {
      const holdMinutes = Math.max(60, await getSettingNumber(q, "payment_hold_minutes"));
      const holdUntil = new Date(Math.min(now.getTime() + holdMinutes * 60000, new Date(b.start_at).getTime()));
      await transition(q, b, "pending_payment", actor, "host", null, { hold_expires_at: holdUntil });
      await notify(q, b.driver_id, {
        type: "booking_accepted",
        title: `Host accepted ${b.code}`,
        body: "Complete payment to confirm your slot.",
        link: `/checkout/${b.id}`,
        email: true,
      });
    } else {
      await transition(q, b, "declined", actor, "host", reason || null, { cancel_reason: reason || null });
      await notify(q, b.driver_id, {
        type: "booking_declined",
        title: `Request ${b.code} declined`,
        body: reason || "The host could not accept this request. You have not been charged.",
        link: `/bookings/${b.id}`,
        email: true,
      });
    }
  });
}

/** Cancel per the displayed policy. Refunds are computed here, never taken from the client. */
export async function cancelBooking(
  db: Db,
  actor: Actor | null,
  provider: PaymentProvider,
  bookingId: string,
  reason: string,
  now = new Date(),
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    const role = roleIn(b, actor);
    const paid = ["confirmed", "checked_in"].includes(b.status);
    if (!["requested", "pending_payment", "confirmed", "checked_in"].includes(b.status)) {
      throw new AppError("invalid", b.status === "in_progress" ? "This session has started. Report a problem instead of cancelling." : "This booking can no longer be cancelled.");
    }
    if (b.status === "checked_in" && role === "driver") {
      throw new AppError("invalid", "You have checked in. Report a problem if the charger did not work.");
    }
    const decision = paid
      ? refundForCancellation(b.cancellation_policy, b.amount_paise, new Date(b.start_at), now, role)
      : { percent: 0, refundPaise: 0, rule: "No payment taken" };
    await transition(q, b, "cancelled", actor, role, reason || null, {
      cancelled_at: now,
      cancelled_by: role,
      cancel_reason: reason || null,
    });
    let refund = null;
    if (decision.refundPaise > 0) {
      refund = await issueRefund(q, provider, {
        booking: b,
        amountPaise: decision.refundPaise,
        reason: `Cancellation (${role}): ${decision.rule}`,
        actorId: actor.userId,
        role,
        policySnapshot: { policy: b.cancellation_policy, ...decision },
      });
    }
    if (role === "admin") await audit(q, actor.userId, "booking.cancel", "booking", b.id, { reason, after: decision });
    const other = role === "driver" ? b.host_id : b.driver_id;
    await notify(q, other, {
      type: "booking_cancelled",
      title: `Booking ${b.code} cancelled`,
      body: role === "driver" ? "The driver cancelled this booking." : "This booking was cancelled. Any payment is refunded in full.",
      link: role === "driver" ? "/host/bookings" : `/bookings/${b.id}`,
      email: true,
    });
    return { decision, refund };
  });
}

/** Driver confirms arrival (manual check-in; there is no hardware integration). */
export async function checkIn(db: Db, actor: Actor | null, bookingId: string, now = new Date()) {
  requireRole(actor, "driver");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    if (b.driver_id !== actor.userId) throw new AppError("not_found", "Booking not found.");
    const start = new Date(b.start_at).getTime();
    if (now.getTime() < start - 30 * 60000 || now.getTime() > new Date(b.end_at).getTime()) {
      throw new AppError("invalid", "You can check in from 30 minutes before your slot until it ends.");
    }
    await transition(q, b, "checked_in", actor, "driver", null, { checked_in_at: now });
    await notify(q, b.host_id, { type: "check_in", title: `Driver arrived for ${b.code}`, link: "/host/bookings" });
  });
}

/** Host marks the session started / completed. This is a manual confirmation, not metering. */
export async function hostSessionUpdate(
  db: Db,
  actor: Actor | null,
  bookingId: string,
  action: "start" | "complete",
  now = new Date(),
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    const role = roleIn(b, actor);
    if (role === "driver") throw new AppError("forbidden", "Only the host can update the session.");
    if (now.getTime() < new Date(b.start_at).getTime() - 30 * 60000) {
      throw new AppError("invalid", "The session cannot be started this early.");
    }
    if (action === "start") {
      await transition(q, b, "in_progress", actor, role, null, { started_at: now });
    } else {
      await transition(q, b, "completed", actor, role, "Session completion confirmed manually", {
        completed_at: now,
        completion_method: role === "admin" ? "admin" : "host_confirmed",
      });
      await notify(q, b.driver_id, {
        type: "session_completed",
        title: `Session ${b.code} completed`,
        body: "How did it go? Leave a review, or report a problem within 72 hours.",
        link: `/bookings/${b.id}`,
        email: true,
      });
    }
  });
}

export async function openDispute(db: Db, actor: Actor | null, bookingId: string, description: string, now = new Date()) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  if (description.trim().length < 10) throw new AppError("invalid", "Describe the problem (at least 10 characters).");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    const role = roleIn(b, actor);
    if (b.status === "completed" && b.completed_at && now.getTime() - new Date(b.completed_at).getTime() > 72 * 3_600_000) {
      throw new AppError("invalid", "Disputes must be raised within 72 hours of completion. Contact support instead.");
    }
    await transition(q, b, "disputed", actor, role, description.slice(0, 500));
    await q.query(
      `insert into public.support_tickets (user_id, booking_id, category, subject, description) values ($1, $2, 'refund', $3, $4)`,
      [actor.userId, b.id, `Dispute on booking ${b.code}`, description],
    );
    await notify(q, role === "driver" ? b.host_id : b.driver_id, {
      type: "dispute",
      title: `A dispute was opened on ${b.code}`,
      body: "ChargeShare support will review and contact both parties.",
      link: role === "driver" ? "/host/bookings" : `/bookings/${b.id}`,
      email: true,
    });
  });
}

export async function resolveDispute(
  db: Db,
  actor: Actor | null,
  provider: PaymentProvider,
  bookingId: string,
  refundPaise: number,
  note: string,
) {
  requireRole(actor, "admin");
  if (note.trim().length < 5) throw new AppError("invalid", "Record a resolution note.");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    if (b.status !== "disputed") throw new AppError("invalid", "This booking is not in dispute.");
    if (b.driver_id === actor.userId || b.host_id === actor.userId) throw new AppError("forbidden", "You are a party to this booking.");
    let refund = null;
    if (refundPaise > 0) {
      refund = await issueRefund(q, provider, { booking: b, amountPaise: refundPaise, reason: `Dispute resolution: ${note}`, actorId: actor.userId, role: "admin" });
      await transition(q, b, "refunded", actor, "admin", note);
    } else {
      await transition(q, b, "completed", actor, "admin", note, { completed_at: b.completed_at ?? new Date() });
    }
    await audit(q, actor.userId, "dispute.resolve", "booking", b.id, { reason: note, after: { refundPaise } });
    for (const uid of [b.driver_id, b.host_id]) {
      await notify(q, uid, { type: "dispute_resolved", title: `Dispute on ${b.code} resolved`, body: note, email: true });
    }
    return { refund };
  });
}

const CONTACT_PATTERN = /(\+?\d[\d\s-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/g;

/** Booking-scoped messages. Phone numbers and emails are masked to keep contact on-platform. */
export async function sendMessage(db: Db, actor: Actor | null, bookingId: string, body: string) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  const text = body.trim();
  if (!text || text.length > 1000) throw new AppError("invalid", "Messages must be 1–1000 characters.");
  return db.tx(async (q) => {
    const b = await lockBooking(q, bookingId);
    const role = roleIn(b, actor);
    if (role === "admin") throw new AppError("forbidden", "Admins should reply through support tickets.");
    if (["declined", "expired"].includes(b.status)) throw new AppError("invalid", "Messaging is closed for this booking.");
    const masked = text.replace(CONTACT_PATTERN, "[contact details hidden]");
    await q.query("insert into public.messages (booking_id, sender_id, body) values ($1, $2, $3)", [b.id, actor.userId, masked]);
    await notify(q, role === "driver" ? b.host_id : b.driver_id, {
      type: "message",
      title: `New message on ${b.code}`,
      body: masked.slice(0, 120),
      link: role === "driver" ? `/host/bookings?b=${b.id}` : `/bookings/${b.id}`,
    });
    return masked;
  });
}

export async function createReview(db: Db, actor: Actor | null, input: { bookingId: string; rating: number; comment: string }) {
  requireRole(actor, "driver");
  return db.tx(async (q) => {
    const b = await lockBooking(q, input.bookingId);
    if (b.driver_id !== actor.userId) throw new AppError("not_found", "Booking not found.");
    if (b.status !== "completed") throw new AppError("invalid", "You can review a booking once the session is completed.");
    try {
      await q.query(
        "insert into public.reviews (booking_id, listing_id, author_id, rating, comment) values ($1, $2, $3, $4, $5)",
        [b.id, b.listing_id, actor.userId, input.rating, input.comment],
      );
    } catch (e) {
      if (pgCode(e) === "23505") throw new AppError("conflict", "You have already reviewed this booking.");
      throw e;
    }
    await notify(q, b.host_id, { type: "review", title: `New ${input.rating}-star review`, link: "/host" });
  });
}

export async function replyToReview(db: Db, actor: Actor | null, reviewId: string, reply: string) {
  requireRole(actor, "host");
  const { rows } = await db.query<{ host_id: string }>(
    "select l.host_id from public.reviews r join public.charger_listings l on l.id = r.listing_id where r.id = $1",
    [reviewId],
  );
  if (!rows[0] || rows[0].host_id !== actor.userId) throw new AppError("not_found", "Review not found.");
  await db.query("update public.reviews set host_reply = $2 where id = $1", [reviewId, reply.trim().slice(0, 1000) || null]);
}
