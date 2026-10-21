import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import * as local from "@/lib/services/auth-local";
import { loadActor, type Actor, type Role } from "@/lib/services/common";

/**
 * Authentication adapter.
 *  - local (demo): scrypt passwords + revocable server sessions in Postgres.
 *  - supabase: Supabase Auth via @supabase/ssr cookies (needs project keys).
 * Authorisation never trusts the cookie alone: roles are always re-read from the database.
 */
const COOKIE = "cs_session";

function sign(value: string) {
  return createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function unsign(token: string | undefined) {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const value = token.slice(0, i);
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(token.slice(i + 1));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}

async function supabaseClient() {
  const store = await cookies();
  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by the proxy instead.
        }
      },
    },
  });
}

async function currentUserId(): Promise<string | null> {
  if (config.authProvider === "supabase") {
    const sb = await supabaseClient();
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  }
  const sid = unsign((await cookies()).get(COOKIE)?.value);
  if (!sid) return null;
  return local.sessionUser(await getDb(), sid);
}

export async function signIn(email: string, password: string) {
  if (config.authProvider === "supabase") {
    const sb = await supabaseClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("unauthenticated", "Email or password is incorrect.");
    return;
  }
  const db = await getDb();
  const userId = await local.authenticate(db, email, password);
  if (!userId) throw new AppError("unauthenticated", "Email or password is incorrect.");
  const s = await local.createSession(db, userId);
  (await cookies()).set(COOKIE, `${s.id}.${sign(s.id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: s.expires,
  });
}

export async function signUp(email: string, password: string, fullName: string) {
  if (config.authProvider === "supabase") {
    const sb = await supabaseClient();
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${config.appUrl}/auth/callback` },
    });
    if (error) throw new AppError("invalid", error.message);
    return;
  }
  await local.registerUser(await getDb(), { email, password, fullName });
  await signIn(email, password);
}

export async function signOut() {
  if (config.authProvider === "supabase") {
    await (await supabaseClient()).auth.signOut();
    return;
  }
  const store = await cookies();
  const sid = unsign(store.get(COOKIE)?.value);
  if (sid) await local.revokeSession(await getDb(), sid);
  store.delete(COOKIE);
}

export async function requestPasswordReset(email: string) {
  if (config.authProvider === "supabase") {
    const sb = await supabaseClient();
    await sb.auth.resetPasswordForEmail(email, { redirectTo: `${config.appUrl}/auth/callback?next=/reset-password` });
    return;
  }
  await local.requestPasswordReset(await getDb(), email, config.appUrl);
}

export async function completePasswordReset(token: string | null, password: string) {
  if (config.authProvider === "supabase") {
    const sb = await supabaseClient();
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new AppError("invalid", "Your reset link has expired. Request a new one.");
    return;
  }
  if (!token) throw new AppError("invalid", "This reset link is invalid.");
  await local.resetPassword(await getDb(), token, password);
}

export async function exchangeSupabaseCode(code: string) {
  const sb = await supabaseClient();
  await sb.auth.exchangeCodeForSession(code);
}

export interface Viewer extends Actor {
  email: string;
  fullName: string;
  isHost: boolean;
  unread: number;
}

/** The signed-in user for this request (memoised per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = await getDb();
  const actor = await loadActor(db, userId);
  if (!actor) return null;
  const { rows } = await db.query<{ email: string; full_name: string; is_host: boolean; unread: number }>(
    `select u.email, p.full_name,
            exists (select 1 from public.host_profiles h where h.user_id = p.id) as is_host,
            (select count(*)::int from public.notifications n where n.user_id = p.id and n.read_at is null and n.channel = 'in_app') as unread
       from public.profiles p join auth.users u on u.id = p.id where p.id = $1`,
    [userId],
  );
  return { ...actor, email: rows[0].email, fullName: rows[0].full_name, isHost: rows[0].is_host, unread: rows[0].unread };
});

export async function requireViewer(next = "/"): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v;
}

/** Server-side role gate for pages. Non-admins get a 404 so the admin area is not advertised. */
export async function requireRolePage(role: Role, next: string): Promise<Viewer> {
  const v = await requireViewer(next);
  if (!v.roles.includes(role)) {
    if (role === "host") redirect("/host/onboarding");
    notFound();
  }
  return v;
}
