"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { bookingRequestSchema, fieldErrors } from "@/lib/validation";
import { availabilityContext } from "@/lib/services/listings";
import { createBooking, quoteBooking } from "@/lib/services/bookings";
import { availableStartTimes } from "@/lib/domain/availability";
import { AppError } from "@/lib/errors";

export async function slotsAction(listingId: string, date: string, durationMinutes: number): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(durationMinutes)) return [];
  const db = await getDb();
  const { rows } = await db.query("select 1 from public.charger_listings where id = $1 and status = 'active'", [listingId]);
  if (!rows[0]) return [];
  const ctx = await availabilityContext(db, listingId);
  return availableStartTimes(date, durationMinutes, ctx.policy, ctx.rules, ctx.blocked, ctx.busy, new Date());
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
    result = await createBooking(await getDb(), viewer, parsed.data);
  } catch (e) {
    return failure(e);
  }
  redirect(result.status === "pending_payment" ? `/checkout/${result.bookingId}` : `/bookings/${result.bookingId}?requested=1`);
}
