"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { bookingRequestSchema, fieldErrors } from "@/lib/validation";
import { availabilityContext } from "@/lib/services/listings";
import { createBooking, quoteBooking } from "@/lib/services/bookings";
import { availableStartTimes } from "@/lib/domain/availability";
import { localDateString } from "@/lib/domain/time";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { visitorId } from "@/lib/request";
import { rateLimit } from "@/lib/services/rate-limit";
import { track } from "@/lib/services/analytics";

export async function slotsAction(listingId: string, date: string, durationMinutes: number): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(durationMinutes)) return [];
  const db = await getDb();
  const { rows } = await db.query("select 1 from public.charger_listings where id = $1 and status = 'active'", [listingId]);
  if (!rows[0]) return [];
  const ctx = await availabilityContext(db, listingId);
  return availableStartTimes(date, durationMinutes, ctx.policy, ctx.rules, ctx.blocked, ctx.busy, new Date());
}

/** Open start times per day for the next `days` days (IST), for the day-strip calendar. */
export async function calendarAction(listingId: string, durationMinutes: number, days = 14): Promise<{ date: string; open: number; closed: boolean }[]> {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || days < 1 || days > 31) return [];
  const db = await getDb();
  const { rows } = await db.query("select 1 from public.charger_listings where id = $1 and status = 'active'", [listingId]);
  if (!rows[0]) return [];
  const ctx = await availabilityContext(db, listingId);
  const now = new Date();
  const out: { date: string; open: number; closed: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const date = localDateString(new Date(now.getTime() + i * 86400_000), ctx.policy.timeZone);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const closed = !ctx.rules.some((r) => r.weekday === weekday);
    const open = closed ? 0 : availableStartTimes(date, durationMinutes, ctx.policy, ctx.rules, ctx.blocked, ctx.busy, now).length;
    out.push({ date, open, closed });
  }
  return out;
}

export async function quoteAction(input: unknown) {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Choose a date, time and duration." };
  try {
    const viewer = await getViewer();
    const db = await getDb();
    const q = await quoteBooking(db, viewer?.userId ?? null, parsed.data);
    return { ok: true as const, quote: { ...q, start: q.start.toISOString(), end: q.end.toISOString() } };
  } catch (e) {
    const f = failure(e);
    return { ok: false as const, message: f?.message ?? "Could not price this slot." };
  }
}

export async function bookAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = bookingRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), message: "Check the booking details." };
  let result: Awaited<ReturnType<typeof createBooking>>;
  try {
    const viewer = await getViewer();
    if (!viewer) throw new AppError("unauthenticated", "Sign in to book this charger.");
    const db = await getDb();
    await rateLimit(db, `book:${viewer.userId}`, 20, 60 * 60);
    result = await createBooking(db, viewer, parsed.data);
    await track(db, "booking_request", { visitorId: await visitorId(), userId: viewer.userId, listingId: parsed.data.listingId, bookingId: result.bookingId, isDemo: config.demoMode });
  } catch (e) {
    return failure(e);
  }
  redirect(result.status === "pending_payment" ? `/checkout/${result.bookingId}` : `/bookings/${result.bookingId}?requested=1`);
}
