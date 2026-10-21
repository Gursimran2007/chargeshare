import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AppError, pgCode } from "@/lib/errors";
import { notify, type Db } from "./common";

/**
 * Local (demo-mode) authentication backed by the auth schema shim.
 * In production, AUTH_PROVIDER=supabase delegates all of this to Supabase Auth.
 */
const SESSION_DAYS = 14;

export async function registerUser(db: Db, input: { email: string; password: string; fullName: string }) {
  const hash = await hashPassword(input.password);
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values (lower($1), $2, $3, now()) returning id`,
      [input.email, hash, JSON.stringify({ full_name: input.fullName })],
    );
    return rows[0].id;
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError("conflict", "An account with this email already exists.");
    throw e;
  }
}

export async function authenticate(db: Db, email: string, password: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string; encrypted_password: string | null }>(
    "select id, encrypted_password from auth.users where email = lower($1)",
    [email],
  );
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, rows[0]?.encrypted_password ?? "scrypt$AAAA$AAAA");
  return ok && rows[0] ? rows[0].id : null;
}

export async function createSession(db: Db, userId: string, now = new Date()) {
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.local_sessions (user_id, expires_at) values ($1, $2) returning id",
    [userId, expires],
  );
  return { id: rows[0].id, expires };
}

export async function sessionUser(db: Db, sessionId: string, now = new Date()): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    "select user_id from auth.local_sessions where id = $1 and revoked_at is null and expires_at > $2",
    [sessionId, now],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.query("update auth.local_sessions set revoked_at = now() where id = $1", [sessionId]);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a single-use reset token. Returns it only so tests can use it; the user receives it by email. */
export async function requestPasswordReset(db: Db, email: string, appUrl: string) {
  const { rows } = await db.query<{ id: string }>("select id from auth.users where email = lower($1)", [email]);
  if (!rows[0]) return null; // do not reveal whether the account exists
  const token = randomBytes(24).toString("base64url");
  await db.tx(async (q) => {
    await q.query(
      "insert into auth.local_password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '30 minutes')",
      [sha(token), rows[0].id],
    );
    await notify(q, rows[0].id, {
      type: "password_reset",
      title: "Reset your ChargeShare password",
      body: `Use this link within 30 minutes to choose a new password. If you did not ask for this, ignore this email.`,
      link: `${appUrl}/reset-password?token=${token}`,
      email: true,
    });
  });
  return token;
}

export async function resetPassword(db: Db, token: string, newPassword: string) {
  const hash = await hashPassword(newPassword);
  return db.tx(async (q) => {
    const { rows } = await q.query<{ user_id: string }>(
      `update auth.local_password_resets set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
      [sha(token)],
    );
    if (!rows[0]) throw new AppError("invalid", "This reset link is invalid or has expired.");
    await q.query("update auth.users set encrypted_password = $1 where id = $2", [hash, rows[0].user_id]);
    await q.query("update auth.local_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [
      rows[0].user_id,
    ]);
    return rows[0].user_id;
  });
}
