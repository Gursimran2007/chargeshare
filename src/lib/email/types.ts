export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  /** "outbox" captures mail without sending it (demo/dev). */
  name: "outbox" | "resend";
  send(m: OutgoingEmail): Promise<void>;
}

/**
 * Recipients allowed to receive real email. Entries are full addresses or "@domain".
 * An empty list blocks everyone unless sending to all is explicitly enabled.
 */
export function recipientAllowed(email: string, allowlist: string[], allowAll: boolean) {
  if (allowAll) return true;
  const e = email.trim().toLowerCase();
  return allowlist.some((a) => {
    const rule = a.trim().toLowerCase();
    return rule.startsWith("@") ? e.endsWith(rule) : e === rule;
  });
}
