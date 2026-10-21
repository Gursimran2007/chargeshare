import "server-only";
import { isAppError } from "@/lib/errors";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string>; data?: unknown } | null;

/** Converts thrown errors into a user-safe action result. Unknown errors are logged, not leaked. */
export function failure(e: unknown): ActionState {
  if (isAppError(e)) return { ok: false, message: e.message };
  if (e && typeof e === "object" && "digest" in e) throw e; // let Next.js redirect / notFound through
  console.error(e);
  return { ok: false, message: "Something went wrong on our side. Please try again." };
}
