import "server-only";
import { cookies, headers } from "next/headers";

export const VISITOR_COOKIE = "cs_vid";

/** Best-effort client IP for rate limiting (first X-Forwarded-For hop set by the hosting proxy). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Random first-party visitor id set by the proxy; used only for aggregate funnel metrics. */
export async function visitorId() {
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}
