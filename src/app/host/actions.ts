"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { saveUpload } from "@/lib/storage";
import { fieldErrors, hostProfileSchema, listingSchema } from "@/lib/validation";
import { zonedToUtc } from "@/lib/domain/time";
import {
  addBlockedTime,
  addListingPhoto,
  assertHostOwnsListing,
  createListing,
  removeBlockedTime,
  removeListingPhoto,
  saveSafetyChecklist,
  setListingPaused,
  submitListingForReview,
  updateListing,
  upsertHostProfile,
} from "@/lib/services/listings";
import { submitVerification, type CheckType } from "@/lib/services/verification";
import { replyToReview } from "@/lib/services/bookings";
import { rateLimit } from "@/lib/services/rate-limit";

async function viewer() {
  const v = await getViewer();
  if (!v) throw new AppError("unauthenticated", "Please sign in again.");
  return v;
}

export async function hostProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = hostProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await upsertHostProfile(await getDb(), await viewer(), { ...parsed.data, bio: parsed.data.bio ?? "" });
    revalidatePath("/host", "layout");
    return { ok: true, message: "Host profile saved." };
  } catch (e) {
    return failure(e);
  }
}

const SAFETY_KEYS = ["electrician_inspection", "dedicated_circuit", "rcd_protection", "property_permission", "insurance", "incident_plan", "no_domestic_socket"];

export async function safetyChecklistAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const checklist = Object.fromEntries(SAFETY_KEYS.map((k) => [k, form.get(k) === "on"]));
    await saveSafetyChecklist(await getDb(), await viewer(), checklist);
    revalidatePath("/host/onboarding");
    return { ok: true, message: "Checklist saved." };
  } catch (e) {
    return failure(e);
  }
}

export async function verificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const v = await viewer();
    const checkType = String(form.get("checkType")) as CheckType;
    const listingId = form.get("listingId") ? String(form.get("listingId")) : null;
    const db = await getDb();
    await rateLimit(db, `upload:${v.userId}`, 40, 60 * 60);
    if (listingId) await assertHostOwnsListing(db, v, listingId);
    const files = form.getAll("evidence").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
    const paths: string[] = [];
    for (const f of files) paths.push(await saveUpload(f, `evidence/${v.userId}`));
    const details: Record<string, string> = {};
    for (const [k, val] of form.entries()) {
      if (k.startsWith("d_") && typeof val === "string") details[k.slice(2)] = val.slice(0, 300);
    }
    await submitVerification(db, v, { checkType, listingId, details, evidencePaths: paths });
    revalidatePath(listingId ? `/host/listings/${listingId}` : "/host/onboarding");
    return { ok: true, message: "Submitted for review. We'll notify you of the decision." };
  } catch (e) {
    return failure(e);
  }
}

export async function saveListingAction(listingId: string | null, data: unknown): Promise<ActionState & { id?: string }> {
  const parsed = listingSchema.safeParse(data);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), message: "Some details need fixing." };
  try {
    const db = await getDb();
    const v = await viewer();
    if (listingId) {
      const r = await updateListing(db, v, listingId, parsed.data);
      revalidatePath(`/host/listings/${listingId}`);
      return {
        ok: true,
        id: listingId,
        message: r.specChanged ? "Saved. Charger or location details changed, so the listing goes back for review." : "Listing saved.",
      };
    }
    const id = await createListing(db, v, parsed.data);
    revalidatePath("/host");
    return { ok: true, id, message: "Draft created. Next: photos and verification documents." };
  } catch (e) {
    return failure(e) ?? { ok: false };
  }
}

export async function submitReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("listingId"));
  try {
    await submitListingForReview(await getDb(), await viewer(), id);
    revalidatePath(`/host/listings/${id}`);
    return { ok: true, message: "Sent for review. Most reviews take 2–3 working days." };
  } catch (e) {
    return failure(e);
  }
}

export async function pauseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("listingId"));
  const pause = form.get("pause") === "1";
  try {
    await setListingPaused(await getDb(), await viewer(), id, pause);
    revalidatePath(`/host/listings/${id}`);
    revalidatePath("/host");
    return { ok: true, message: pause ? "Listing paused. Existing bookings are unaffected." : "Listing is live again." };
  } catch (e) {
    return failure(e);
  }
}

export async function photoAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("listingId"));
  try {
    const v = await viewer();
    const db = await getDb();
    await rateLimit(db, `upload:${v.userId}`, 40, 60 * 60);
    await assertHostOwnsListing(db, v, id);
    const kind = form.get("kind") === "installation" ? "installation" : "listing";
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
    if (!files.length) throw new AppError("invalid", "Choose at least one photo.");
    for (const f of files) {
      const key = await saveUpload(f, `listings/${id}`, { imagesOnly: true });
      await addListingPhoto(db, v, id, key, kind);
    }
    revalidatePath(`/host/listings/${id}`);
    return { ok: true, message: `${files.length} photo${files.length > 1 ? "s" : ""} uploaded.` };
  } catch (e) {
    return failure(e);
  }
}

export async function deletePhotoAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeListingPhoto(await getDb(), await viewer(), String(form.get("photoId")));
    revalidatePath(`/host/listings/${form.get("listingId")}`);
    return { ok: true, message: "Photo removed." };
  } catch (e) {
    return failure(e);
  }
}

export async function blockTimeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("listingId"));
  try {
    const date = String(form.get("date"));
    const endDate = String(form.get("endDate") || date);
    const start = zonedToUtc(date, String(form.get("from") || "00:00"), "Asia/Kolkata");
    const end = zonedToUtc(endDate, String(form.get("to") || "23:59"), "Asia/Kolkata");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("invalid", "Choose a date.");
    await addBlockedTime(await getDb(), await viewer(), id, start, end, String(form.get("reason") ?? ""));
    revalidatePath(`/host/listings/${id}`);
    revalidatePath("/host/bookings");
    return { ok: true, message: "Time blocked. Drivers can't book it." };
  } catch (e) {
    return failure(e);
  }
}

export async function unblockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeBlockedTime(await getDb(), await viewer(), String(form.get("blockedId")));
    revalidatePath(`/host/listings/${form.get("listingId")}`);
    return { ok: true, message: "Block removed." };
  } catch (e) {
    return failure(e);
  }
}

export async function replyReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await replyToReview(await getDb(), await viewer(), String(form.get("reviewId")), String(form.get("reply") ?? ""));
    revalidatePath("/host", "layout");
    revalidatePath("/chargers", "layout");
    return { ok: true, message: "Reply posted." };
  } catch (e) {
    return failure(e);
  }
}
