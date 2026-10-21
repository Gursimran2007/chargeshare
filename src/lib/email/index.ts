import "server-only";
import { createResendTransport } from "./resend";
import type { EmailTransport } from "./types";

export type { EmailTransport } from "./types";

const outbox: EmailTransport = { name: "outbox", send: async () => {} };

/**
 * Real delivery only when RESEND_API_KEY and EMAIL_FROM are set. Otherwise mail is
 * captured in the outbox (/dev/outbox in demo mode). Recipients are further limited
 * by EMAIL_ALLOWLIST unless EMAIL_ALLOW_ALL_RECIPIENTS=true (production only).
 */
export function emailTransport(): EmailTransport {
  const key = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "";
  return key && from ? createResendTransport(key, from) : outbox;
}

export function emailPolicy() {
  return {
    allowlist: (process.env.EMAIL_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    allowAll: process.env.NODE_ENV === "production" && process.env.EMAIL_ALLOW_ALL_RECIPIENTS === "true",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}
