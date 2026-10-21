"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import * as auth from "@/lib/auth";
import { failure, type ActionState } from "@/lib/actions";
import { emailSchema, fieldErrors, passwordSchema, signInSchema, signUpSchema } from "@/lib/validation";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";
import { clientIp, visitorId } from "@/lib/request";
import { rateLimit } from "@/lib/services/rate-limit";
import { track } from "@/lib/services/analytics";

function safeNext(v: FormDataEntryValue | null, fallback = "/dashboard") {
  const s = typeof v === "string" ? v : "";
  // Only same-site relative paths, to prevent open redirects.
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    const db = await getDb();
    await rateLimit(db, `login:${parsed.data.email}`, 10, 15 * 60);
    await rateLimit(db, `login-ip:${await clientIp()}`, 40, 15 * 60);
    await auth.signIn(parsed.data.email, parsed.data.password);
  } catch (e) {
    return failure(e);
  }
  redirect(safeNext(form.get("next")));
}

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    const db = await getDb();
    await rateLimit(db, `signup-ip:${await clientIp()}`, 10, 60 * 60);
    await auth.signUp(parsed.data.email, parsed.data.password, parsed.data.fullName);
    await track(db, "signup", { visitorId: await visitorId(), props: { intent: parsed.data.intent }, isDemo: config.demoMode });
  } catch (e) {
    return failure(e);
  }
  redirect(parsed.data.intent === "host" ? "/host/onboarding" : "/account?welcome=1");
}

export async function signOutAction() {
  await auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    const db = await getDb();
    await rateLimit(db, `reset:${parsed.data.email}`, 3, 60 * 60);
    await rateLimit(db, `reset-ip:${await clientIp()}`, 10, 60 * 60);
    await auth.requestPasswordReset(parsed.data.email);
  } catch (e) {
    return failure(e);
  }
  // Same response whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string(), token: z.string().optional() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  try {
    await auth.completePasswordReset(parsed.data.token ?? null, parsed.data.password);
  } catch (e) {
    return failure(e);
  }
  redirect("/login?reset=1");
}
