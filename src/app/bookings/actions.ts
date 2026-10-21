"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { activeProvider, currentPaymentMode, providerByName } from "@/lib/payments";
import { AppError } from "@/lib/errors";
import { reviewSchema, fieldErrors } from "@/lib/validation";
import {
  cancelBooking,
  checkIn,
  createReview,
  hostSessionUpdate,
  openDispute,
  respondToRequest,
  sendMessage,
} from "@/lib/services/bookings";
import { capturePayment, markPaymentFailed, startPayment } from "@/lib/services/payments";
import { demoProvider } from "@/lib/payments";
import { rateLimit } from "@/lib/services/rate-limit";

async function viewerOrThrow() {
  const v = await getViewer();
  if (!v) throw new AppError("unauthenticated", "Please sign in again.");
  return v;
}

function refresh(id: string) {
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/host/bookings");
}

async function bookingProvider(bookingId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ provider: string }>(
    "select provider from public.payments where booking_id = $1 and status in ('captured','partially_refunded') limit 1",
    [bookingId],
  );
  // Without a captured payment no refund is possible, so the provider is never called.
  return rows[0] ? providerByName(rows[0].provider) : demoProvider();
}

export async function cancelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    const out = await cancelBooking(await getDb(), await viewerOrThrow(), await bookingProvider(id), id, String(form.get("reason") ?? "").slice(0, 300));
    refresh(id);
    return {
      ok: true,
      message: out.refund ? `Booking cancelled. Refund of ₹${(out.refund.amountPaise / 100).toFixed(2)} initiated.` : "Booking cancelled.",
    };
  } catch (e) {
    return failure(e);
  }
}

export async function checkInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    await checkIn(await getDb(), await viewerOrThrow(), id);
    refresh(id);
    return { ok: true, message: "Checked in. The host has been notified." };
  } catch (e) {
    return failure(e);
  }
}

export async function disputeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    await openDispute(await getDb(), await viewerOrThrow(), id, String(form.get("description") ?? ""));
    refresh(id);
    return { ok: true, message: "Problem reported. Our team will contact you." };
  } catch (e) {
    return failure(e);
  }
}

export async function reviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await createReview(await getDb(), await viewerOrThrow(), parsed.data);
    refresh(parsed.data.bookingId);
    return { ok: true, message: "Thanks for your review." };
  } catch (e) {
    return failure(e);
  }
}

export async function messageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    const v = await viewerOrThrow();
    const db = await getDb();
    await rateLimit(db, `msg:${v.userId}`, 40, 10 * 60);
    const masked = await sendMessage(db, v, id, String(form.get("body") ?? ""));
    refresh(id);
    return { ok: true, message: masked.includes("[contact details hidden]") ? "Sent. Phone numbers and emails are hidden to keep contact on ChargeShare." : undefined };
  } catch (e) {
    return failure(e);
  }
}

export async function hostRespondAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  const accept = form.get("decision") === "accept";
  try {
    await respondToRequest(await getDb(), await viewerOrThrow(), id, accept, String(form.get("reason") ?? ""));
    refresh(id);
    return { ok: true, message: accept ? "Accepted. The driver has been asked to pay." : "Request declined." };
  } catch (e) {
    return failure(e);
  }
}

export async function hostSessionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  const step = form.get("step") === "complete" ? "complete" : "start";
  try {
    await hostSessionUpdate(await getDb(), await viewerOrThrow(), id, step);
    refresh(id);
    return { ok: true, message: step === "complete" ? "Session marked completed." : "Session marked as started." };
  } catch (e) {
    return failure(e);
  }
}

/** Starts checkout: creates (or reuses) the provider order. */
export async function startCheckoutAction(bookingId: string) {
  try {
    const viewer = await viewerOrThrow();
    const provider = activeProvider();
    const p = await startPayment(await getDb(), viewer, bookingId, provider);
    return {
      ok: true as const,
      provider: provider.name,
      orderId: p.provider_order_id,
      amountPaise: p.amount_paise,
      keyId: provider.publicKeyId,
      alreadyPaid: p.status === "captured",
    };
  } catch (e) {
    return { ok: false as const, message: failure(e)?.message ?? "Could not start payment." };
  }
}

/** DEMO ONLY: simulates the provider's checkout outcome, then runs the real verification path. */
export async function demoPayAction(bookingId: string, orderId: string, outcome: "success" | "failure") {
  const mode = currentPaymentMode();
  if (!mode.ok || mode.provider !== "demo") return { ok: false, message: "Demo payments are disabled in this environment." };
  try {
    const viewer = await viewerOrThrow();
    const db = await getDb();
    const { rows } = await db.query<{ driver_id: string }>(
      "select b.driver_id from public.payments p join public.bookings b on b.id = p.booking_id where p.provider_order_id = $1 and b.id = $2",
      [orderId, bookingId],
    );
    if (!rows[0] || rows[0].driver_id !== viewer.userId) throw new AppError("not_found", "Payment not found.");
    const provider = demoProvider();
    if (outcome === "failure") {
      await markPaymentFailed(db, provider, orderId, "Simulated failure (demo)");
      return { ok: false, message: "Simulated payment failure. Nothing was charged. You can try again." };
    }
    const sim = provider.simulateCheckout(orderId);
    await capturePayment(db, provider, { orderId, paymentId: sim.paymentId, signature: sim.signature, source: "checkout" });
  } catch (e) {
    return { ok: false, message: failure(e)?.message ?? "Payment failed." };
  }
  refresh(bookingId);
  redirect(`/bookings/${bookingId}?confirmed=1`);
}
