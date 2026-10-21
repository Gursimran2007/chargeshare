import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp } from "@/lib/csp";

const VISITOR_COOKIE = "cs_vid";

/**
 * 1. Sets a per-request nonce-based Content-Security-Policy on HTML responses.
 * 2. Issues a random first-party visitor id (aggregate funnel metrics only).
 * 3. Refreshes Supabase Auth cookies when AUTH_PROVIDER=supabase (the pattern
 *    recommended by @supabase/ssr).
 * Authorisation is never decided here; pages and actions check roles server-side.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    tileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    razorpay: process.env.PAYMENT_PROVIDER === "razorpay",
    https: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
  });

  const newVisitor = !request.cookies.get(VISITOR_COOKIE);
  const vid = newVisitor ? crypto.randomUUID() : null;
  if (vid) request.cookies.set(VISITOR_COOKIE, vid);

  // Next.js reads the nonce from the request's CSP header and applies it to its scripts.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  const useSupabase = (process.env.AUTH_PROVIDER ?? (process.env.DATABASE_URL ? "supabase" : "local")) === "supabase";
  if (useSupabase && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  }
  response.headers.set("Content-Security-Policy", csp);
  if (vid) {
    response.cookies.set(VISITOR_COOKIE, vid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
