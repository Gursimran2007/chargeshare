import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of hex signatures. */
export function safeEqualHex(expected: string, actual: string | null | undefined) {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
}
