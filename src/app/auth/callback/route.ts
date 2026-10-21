import { NextResponse, type NextRequest } from "next/server";
import { exchangeSupabaseCode } from "@/lib/auth";
import { config } from "@/lib/config";

/** Supabase Auth email links (confirmation, password recovery) land here. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  if (config.authProvider === "supabase" && code) await exchangeSupabaseCode(code);
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return NextResponse.redirect(new URL(dest, req.url));
}
