import { AppError } from "@/lib/errors";
import { adminIds, audit, notify, requireActive, requireRole, type Actor, type Db } from "./common";
import { cancelUpcomingForListings, type ProviderFor } from "./bookings";

export async function restrictUser(db: Db, actor: Actor | null, userId: string, restricted: boolean, reason: string, providerFor?: ProviderFor) {
  requireRole(actor, "admin");
  if (userId === actor.userId) throw new AppError("invalid", "You cannot restrict your own account.");
  if (restricted && reason.trim().length < 5) throw new AppError("invalid", "A reason is required.");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ is_restricted: boolean }>("select is_restricted from public.profiles where id = $1 for update", [userId]);
    if (!rows[0]) throw new AppError("not_found", "User not found.");
    await q.query("update public.profiles set is_restricted = $2, restricted_reason = $3 where id = $1", [
      userId,
      restricted,
      restricted ? reason.trim() : null,
    ]);
    if (restricted) {
      // Restricted hosts' listings go offline.
      const { rows: suspended } = await q.query<{ id: string }>(
        "update public.charger_listings set status = 'suspended', suspended_reason = 'Host account restricted' where host_id = $1 and status in ('active','paused') returning id",
        [userId],
      );
      await cancelUpcomingForListings(q, suspended.map((l) => l.id), "Host account restricted", actor.userId, providerFor);
    }
    await audit(q, actor.userId, restricted ? "user.restrict" : "user.unrestrict", "user", userId, {
      before: rows[0],
      after: { is_restricted: restricted },
      reason,
    });
  });
}

export async function setCommission(db: Db, actor: Actor | null, bps: number, reason: string) {
  requireRole(actor, "admin");
  if (!Number.isInteger(bps) || bps < 0 || bps > 5000) throw new AppError("invalid", "Commission must be between 0% and 50%.");
  if (reason.trim().length < 5) throw new AppError("invalid", "Record why the commission is changing.");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ value: unknown }>("select value from public.platform_settings where key = 'commission_bps' for update");
    await q.query("update public.platform_settings set value = $1, updated_by = $2, updated_at = now() where key = 'commission_bps'", [
      JSON.stringify(bps),
      actor.userId,
    ]);
    await audit(q, actor.userId, "settings.commission", "platform_settings", "commission_bps", {
      before: rows[0]?.value,
      after: bps,
      reason,
    });
  });
}

export async function createTicket(
  db: Db,
  actor: Actor | null,
  input: { category: string; subject: string; description: string; bookingId?: string | null },
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  return db.tx(async (q) => {
    if (input.bookingId) {
      const { rows } = await q.query("select 1 from public.bookings where id = $1 and (driver_id = $2 or host_id = $2)", [
        input.bookingId,
        actor.userId,
      ]);
      if (!rows[0]) throw new AppError("not_found", "Booking not found.");
    }
    const { rows } = await q.query<{ id: string }>(
      "insert into public.support_tickets (user_id, booking_id, category, subject, description) values ($1, $2, $3, $4, $5) returning id",
      [actor.userId, input.bookingId ?? null, input.category, input.subject, input.description],
    );
    for (const id of await adminIds(q)) {
      await notify(q, id, { type: "ticket", title: `New ${input.category} ticket`, body: input.subject, link: "/admin/support" });
    }
    return rows[0].id;
  });
}

export async function respondToTicket(db: Db, actor: Actor | null, ticketId: string, status: string, response: string) {
  requireRole(actor, "admin");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ user_id: string; status: string }>(
      "select user_id, status::text from public.support_tickets where id = $1 for update",
      [ticketId],
    );
    if (!rows[0]) throw new AppError("not_found", "Ticket not found.");
    await q.query("update public.support_tickets set status = $2, admin_response = nullif($3, ''), assigned_to = $4 where id = $1", [
      ticketId,
      status,
      response.trim(),
      actor.userId,
    ]);
    await audit(q, actor.userId, "ticket.update", "support_ticket", ticketId, { before: rows[0], after: { status } });
    await notify(q, rows[0].user_id, {
      type: "ticket",
      title: `Support ticket ${status.replace("_", " ")}`,
      body: response.slice(0, 200),
      link: "/support",
      email: true,
    });
  });
}

const SEVERITY: Record<string, string> = {
  safety_hazard: "critical",
  electrical_issue: "high",
  fraud: "high",
  harassment: "high",
  damage: "medium",
  access_problem: "medium",
  misleading_listing: "medium",
  other: "low",
};

export async function createReport(
  db: Db,
  actor: Actor | null,
  input: { targetType: "listing" | "user" | "booking"; targetId: string; reason: string; details: string },
) {
  if (!actor) throw new AppError("unauthenticated", "Please sign in.");
  requireActive(actor);
  const severity = SEVERITY[input.reason] ?? "medium";
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string }>(
      "insert into public.reports (reporter_id, target_type, target_id, reason, details, severity) values ($1, $2, $3, $4, $5, $6) returning id",
      [actor.userId, input.targetType, input.targetId, input.reason, input.details, severity],
    );
    for (const id of await adminIds(q)) {
      await notify(q, id, {
        type: "report",
        title: `${severity.toUpperCase()} report: ${input.reason.replace("_", " ")}`,
        link: "/admin/reports",
        email: severity === "critical",
      });
    }
    return { id: rows[0].id, severity };
  });
}

export async function handleReport(
  db: Db,
  actor: Actor | null,
  reportId: string,
  status: "investigating" | "actioned" | "dismissed",
  note: string,
) {
  requireRole(actor, "admin");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ status: string; reporter_id: string }>(
      "select status::text, reporter_id from public.reports where id = $1 for update",
      [reportId],
    );
    if (!rows[0]) throw new AppError("not_found", "Report not found.");
    await q.query("update public.reports set status = $2, resolution_note = nullif($3, ''), handled_by = $4, handled_at = now() where id = $1", [
      reportId,
      status,
      note.trim(),
      actor.userId,
    ]);
    await audit(q, actor.userId, `report.${status}`, "report", reportId, { before: rows[0], after: { status }, reason: note });
    await notify(q, rows[0].reporter_id, { type: "report", title: `Your report is ${status}`, body: note.slice(0, 200), link: "/support" });
  });
}

/** Hide or restore a review. Hidden reviews disappear from listings and ratings; the author still sees theirs. */
export async function setReviewHidden(db: Db, actor: Actor | null, reviewId: string, hidden: boolean, reason: string) {
  requireRole(actor, "admin");
  if (hidden && reason.trim().length < 5) throw new AppError("invalid", "Record why the review is being hidden.");
  return db.tx(async (q) => {
    const { rows } = await q.query<{ is_hidden: boolean; author_id: string }>(
      "select is_hidden, author_id from public.reviews where id = $1 for update",
      [reviewId],
    );
    if (!rows[0]) throw new AppError("not_found", "Review not found.");
    await q.query("update public.reviews set is_hidden = $2 where id = $1", [reviewId, hidden]);
    await audit(q, actor.userId, hidden ? "review.hide" : "review.restore", "review", reviewId, {
      before: { is_hidden: rows[0].is_hidden },
      after: { is_hidden: hidden },
      reason,
    });
    if (hidden) {
      await notify(q, rows[0].author_id, {
        type: "review",
        title: "One of your reviews was hidden",
        body: `It no longer appears publicly. Reason: ${reason.trim()}`,
        link: "/support",
      });
    }
  });
}
