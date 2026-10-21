import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMaintenance } from "@/lib/services/maintenance";

/**
 * Scheduled maintenance: expire unpaid holds and unanswered requests, remind hosts
 * about pending requests, and escalate sessions that ended without confirmation.
 * Call every few minutes with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron,
 * a GitHub Action, or any scheduler). Disabled when CRON_SECRET is unset.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runMaintenance(await getDb()));
}

export const GET = POST;
