"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { demoProvider, providerByName } from "@/lib/payments";
import { AppError } from "@/lib/errors";
import { rupeesToPaise } from "@/lib/money";
import { approveListing, moderateListing, reviewVerification, type Decision } from "@/lib/services/verification";
import { resolveDispute } from "@/lib/services/bookings";
import { adminRefund } from "@/lib/services/payments";
import { createPayout, updatePayoutStatus } from "@/lib/services/finance";
import { handleReport, respondToTicket, restrictUser, setCommission } from "@/lib/services/admin";

// Every action re-checks the admin role server-side inside the service call.
async function admin() {
  const v = await getViewer();
  if (!v) throw new AppError("unauthenticated", "Please sign in again.");
  return v;
}

function done(message: string, ...paths: string[]): ActionState {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

async function providerFor(bookingId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ provider: string }>("select provider from public.payments where booking_id = $1 and status <> 'failed' order by created_at desc limit 1", [bookingId]);
  return rows[0] ? providerByName(rows[0].provider) : demoProvider();
}

export async function reviewCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await reviewVerification(await getDb(), await admin(), String(form.get("id")), String(form.get("decision")) as Decision, String(form.get("reason") ?? ""), providerByName);
    return done("Decision recorded.", "/admin/verifications");
  } catch (e) {
    return failure(e);
  }
}

export async function approveListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await approveListing(await getDb(), await admin(), String(form.get("listingId")));
    return done("Listing approved and live.", "/admin/verifications", "/admin/listings");
  } catch (e) {
    return failure(e);
  }
}

export async function moderateListingAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const act = String(form.get("act")) as "reject" | "suspend" | "request_changes";
    await moderateListing(await getDb(), await admin(), String(form.get("listingId")), act, String(form.get("reason") ?? ""), providerByName);
    return done("Listing updated.", "/admin/listings", "/admin/verifications");
  } catch (e) {
    return failure(e);
  }
}

export async function resolveDisputeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    const refund = rupeesToPaise(Number(form.get("refund") || 0));
    await resolveDispute(await getDb(), await admin(), await providerFor(id), id, refund, String(form.get("note") ?? ""));
    return done("Dispute resolved.", "/admin/bookings");
  } catch (e) {
    return failure(e);
  }
}

export async function refundAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("bookingId"));
  try {
    await adminRefund(await getDb(), await admin(), await providerFor(id), id, rupeesToPaise(Number(form.get("amount") || 0)), String(form.get("reason") ?? ""));
    return done("Refund issued.", "/admin/bookings");
  } catch (e) {
    return failure(e);
  }
}

export async function createPayoutAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await createPayout(await getDb(), await admin(), String(form.get("hostId")), String(form.get("period") ?? ""));
    return done("Payout created.", "/admin/payouts");
  } catch (e) {
    return failure(e);
  }
}

export async function payoutStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await updatePayoutStatus(await getDb(), await admin(), String(form.get("payoutId")), String(form.get("status")) as "paid", String(form.get("reference") ?? ""));
    return done("Payout updated.", "/admin/payouts");
  } catch (e) {
    return failure(e);
  }
}

export async function restrictAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const restrict = form.get("restrict") === "1";
    await restrictUser(await getDb(), await admin(), String(form.get("userId")), restrict, String(form.get("reason") ?? ""), providerByName);
    return done(restrict ? "Account restricted." : "Restriction lifted.", "/admin/users");
  } catch (e) {
    return failure(e);
  }
}

export async function commissionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const pct = Number(form.get("percent"));
    await setCommission(await getDb(), await admin(), Math.round(pct * 100), String(form.get("reason") ?? ""));
    return done("Commission updated. Applies to new bookings only.", "/admin/settings");
  } catch (e) {
    return failure(e);
  }
}

export async function ticketAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await respondToTicket(await getDb(), await admin(), String(form.get("ticketId")), String(form.get("status")), String(form.get("response") ?? ""));
    return done("Ticket updated.", "/admin/support");
  } catch (e) {
    return failure(e);
  }
}

export async function reportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await handleReport(await getDb(), await admin(), String(form.get("reportId")), String(form.get("status")) as "actioned", String(form.get("note") ?? ""));
    return done("Report updated.", "/admin/support");
  } catch (e) {
    return failure(e);
  }
}
