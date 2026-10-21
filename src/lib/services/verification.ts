import { AppError } from "@/lib/errors";
import { audit, notify, requireActive, requireRole, type Actor, type Db } from "./common";
import { cancelUpcomingForListings, type ProviderFor } from "./bookings";

export type CheckType = "identity" | "property_permission" | "charger_spec" | "installation_evidence" | "electrical_safety";
export type Decision = "verified" | "needs_info" | "rejected" | "suspended";

export const CHECK_INFO: Record<CheckType, { title: string; what: string; evidence: string }> = {
  identity: {
    title: "Identity",
    what: "Confirms the host is a real, contactable person or business.",
    evidence: "Government photo ID (name must match your account) or business registration for companies.",
  },
  property_permission: {
    title: "Property permission",
    what: "Confirms the host owns the parking space or has written permission to offer it.",
    evidence: "Ownership/lease document, or a signed NOC from the resident welfare association or property manager, plus a recent electricity bill showing the connection's tariff category.",
  },
  charger_spec: {
    title: "Charger specification",
    what: "Confirms the charger make, model, connector and rated power match the listing.",
    evidence: "Photo of the charger's rating plate and the purchase invoice or datasheet.",
  },
  installation_evidence: {
    title: "Installation",
    what: "Confirms the charger is a fixed EVSE installation on a dedicated circuit.",
    evidence: "Installer invoice or work order, and photos of the charger, its isolator/MCB and the parking bay.",
  },
  electrical_safety: {
    title: "Electrical safety",
    what: "Confirms a qualified electrician has inspected the installation (earthing, RCD protection, cable rating).",
    evidence: "Inspection certificate or signed test report from a licensed electrical contractor, dated within 12 months.",
  },
};

/** Host submits (or resubmits) evidence for a check. Never changes a decision. */
export async function submitVerification(
  db: Db,
  actor: Actor | null,
  input: { checkType: CheckType; listingId?: string | null; details: Record<string, string>; evidencePaths: string[] },
) {
  requireRole(actor, "host");
  requireActive(actor);
  if (input.evidencePaths.length === 0 && input.checkType !== "charger_spec") {
    throw new AppError("invalid", "Attach at least one supporting document or photo.");
  }
  return db.tx(async (q) => {
    const where =
      input.checkType === "identity"
        ? { sql: "host_id = $1 and check_type = 'identity'", params: [actor.userId] }
        : { sql: "listing_id = $1 and check_type = $2", params: [input.listingId, input.checkType] };
    const { rows } = await q.query<{ id: string; host_id: string; status: string }>(
      `select id, host_id, status::text from public.charger_verifications where ${where.sql} for update`,
      where.params,
    );
    const v = rows[0];
    if (!v || v.host_id !== actor.userId) throw new AppError("not_found", "Verification item not found.");
    if (v.status === "verified") throw new AppError("invalid", "This item is already verified.");
    if (v.status === "suspended") throw new AppError("forbidden", "This item is suspended. Contact support.");
    await q.query(
      `update public.charger_verifications
          set status = 'pending_review', details = $2, evidence_paths = $3, submitted_at = now(),
              submission_count = submission_count + 1
        where id = $1`,
      [v.id, JSON.stringify(input.details), input.evidencePaths],
    );
    return v.id;
  });
}

/** Admin decision on a single check. */
export async function reviewVerification(
  db: Db,
  actor: Actor | null,
  verificationId: string,
  decision: Decision,
  reason: string,
  providerFor?: ProviderFor,
) {
  requireRole(actor, "admin");
  if (decision !== "verified" && reason.trim().length < 5) {
    throw new AppError("invalid", "Give the host a reason so they know what to fix.");
  }
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string; host_id: string; listing_id: string | null; status: string; check_type: CheckType }>(
      "select id, host_id, listing_id, status::text, check_type::text from public.charger_verifications where id = $1 for update",
      [verificationId],
    );
    const v = rows[0];
    if (!v) throw new AppError("not_found", "Verification not found.");
    if (v.host_id === actor.userId) throw new AppError("forbidden", "You cannot review your own verification.");
    if (v.status === "not_submitted") throw new AppError("invalid", "Nothing has been submitted yet.");
    await q.query(
      `update public.charger_verifications set status = $2, decision_reason = $3, reviewed_by = $4, reviewed_at = now() where id = $1`,
      [verificationId, decision, reason.trim() || null, actor.userId],
    );
    // A failed or suspended check takes affected live listings offline immediately.
    if (decision === "suspended" || decision === "rejected") {
      const affected = v.check_type === "identity"
        ? await q.query<{ id: string }>("select id from public.charger_listings where host_id = $1 and status in ('active','paused')", [v.host_id])
        : await q.query<{ id: string }>("select id from public.charger_listings where id = $1 and status in ('active','paused')", [v.listing_id]);
      for (const l of affected.rows) {
        await q.query("update public.charger_listings set status = 'suspended', suspended_reason = $2 where id = $1", [
          l.id,
          `Verification ${decision}: ${CHECK_INFO[v.check_type].title}`,
        ]);
      }
      await cancelUpcomingForListings(q, affected.rows.map((l) => l.id), `${CHECK_INFO[v.check_type].title} check ${decision}`, actor.userId, providerFor);
    }
    if (decision === "needs_info" && v.listing_id) {
      await q.query("update public.charger_listings set status = 'changes_requested' where id = $1 and status = 'pending_review'", [
        v.listing_id,
      ]);
    }
    await audit(q, actor.userId, `verification.${decision}`, "verification", verificationId, {
      before: { status: v.status },
      after: { status: decision, check: v.check_type },
      reason,
    });
    await notify(q, v.host_id, {
      type: "verification",
      title: `${CHECK_INFO[v.check_type].title} check: ${decision.replace("_", " ")}`,
      body: reason || "Your submission was approved.",
      link: v.listing_id ? `/host/listings/${v.listing_id}` : "/host/onboarding",
      email: true,
    });
  });
}

/** Admin approves a listing. Only possible once every check is verified (also enforced by a DB trigger). */
export async function approveListing(db: Db, actor: Actor | null, listingId: string) {
  requireRole(actor, "admin");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ host_id: string; status: string; ok: boolean }>(
      "select host_id, status::text, public.listing_checks_complete(id) as ok from public.charger_listings where id = $1 for update",
      [listingId],
    );
    const l = rows[0];
    if (!l) throw new AppError("not_found", "Listing not found.");
    if (l.host_id === actor.userId) throw new AppError("forbidden", "You cannot approve your own listing.");
    if (!["pending_review", "changes_requested", "suspended", "rejected"].includes(l.status)) {
      throw new AppError("invalid", `A ${l.status} listing cannot be approved.`);
    }
    if (!l.ok) throw new AppError("invalid", "All five verification checks must be approved first.");
    await q.query(
      "update public.charger_listings set status = 'active', approved_at = now(), approved_by = $2, rejection_reason = null, suspended_reason = null where id = $1",
      [listingId, actor.userId],
    );
    await audit(q, actor.userId, "listing.approve", "listing", listingId, { before: { status: l.status }, after: { status: "active" } });
    await notify(q, l.host_id, {
      type: "listing",
      title: "Your charger is live",
      body: "Drivers can now find and book your charger.",
      link: `/host/listings/${listingId}`,
      email: true,
    });
  });
}

export async function moderateListing(
  db: Db,
  actor: Actor | null,
  listingId: string,
  action: "reject" | "suspend" | "request_changes",
  reason: string,
  providerFor?: ProviderFor,
) {
  requireRole(actor, "admin");
  if (reason.trim().length < 5) throw new AppError("invalid", "A reason is required.");
  const status = action === "reject" ? "rejected" : action === "suspend" ? "suspended" : "changes_requested";
  return db.tx(async (q) => {
    const { rows } = await q.query<{ host_id: string; status: string }>(
      "select host_id, status::text from public.charger_listings where id = $1 for update",
      [listingId],
    );
    if (!rows[0]) throw new AppError("not_found", "Listing not found.");
    await q.query(
      `update public.charger_listings set status = $2::listing_status,
         rejection_reason = case when $2::listing_status in ('rejected','changes_requested') then $3::text else rejection_reason end,
         suspended_reason = case when $2::listing_status = 'suspended' then $3::text else suspended_reason end
       where id = $1`,
      [listingId, status, reason.trim()],
    );
    const cascade = status === "suspended" ? await cancelUpcomingForListings(q, [listingId], reason.trim(), actor.userId, providerFor) : null;
    await audit(q, actor.userId, `listing.${action}`, "listing", listingId, {
      before: { status: rows[0].status },
      after: { status, cancelledBookings: cascade?.cancelled ?? 0, inProgressSessions: cascade?.inProgress ?? 0 },
      reason,
    });
    await notify(q, rows[0].host_id, {
      type: "listing",
      title: action === "suspend" ? "Listing suspended" : action === "reject" ? "Listing not approved" : "Changes requested on your listing",
      body: reason,
      link: `/host/listings/${listingId}`,
      email: true,
    });
  });
}
