import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const VISITOR_COOKIE = "cs_vid";

/**
 * 1. Issues a random first-party visitor id (aggregate funnel metrics only).
 * 2. Refreshes Supabase Auth cookies when AUTH_PROVIDER=supabase (the pattern
 *    recommended by @supabase/ssr).
 * Authorisation is never decided here; pages and actions check roles server-side.
 */
export async function proxy(request: NextRequest) {
  const newVisitor = !request.cookies.get(VISITOR_COOKIE);
  const vid = newVisitor ? crypto.randomUUID() : null;
  if (vid) request.cookies.set(VISITOR_COOKIE, vid);

  let response = NextResponse.next({ request });
  const useSupabase = (process.env.AUTH_PROVIDER ?? (process.env.DATABASE_URL ? "supabase" : "local")) === "supabase";
  if (useSupabase && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  }
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
