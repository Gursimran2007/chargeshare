import type { EmailTransport } from "./types";

/**
 * Resend adapter (https://resend.com/docs/api-reference/emails/send-email).
 * Untested without an API key in this repository.
 */
export function createResendTransport(apiKey: string, from: string): EmailTransport {
  return {
    name: "resend",
    async send({ to, subject, text }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text }),
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(`Resend ${res.status}: ${body.message ?? "send failed"}`);
      }
    },
  };
}
