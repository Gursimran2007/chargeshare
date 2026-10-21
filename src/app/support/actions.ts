"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { fieldErrors, reportSchema, ticketSchema } from "@/lib/validation";
import { createReport, createTicket } from "@/lib/services/admin";

export async function ticketCreateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(form);
  const parsed = ticketSchema.safeParse({ ...raw, bookingId: raw.bookingId || null });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await createTicket(await getDb(), await getViewer(), parsed.data);
    revalidatePath("/support");
    return { ok: true, message: "Ticket created. We'll reply by email and here." };
  } catch (e) {
    return failure(e);
  }
}

export async function reportCreateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = reportSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    const r = await createReport(await getDb(), await getViewer(), parsed.data);
    revalidatePath("/support");
    return {
      ok: true,
      message: r.severity === "critical" ? "Report received and escalated. If anyone is in danger, call 112 now." : "Report received. Our team will review it.",
    };
  } catch (e) {
    return failure(e);
  }
}
