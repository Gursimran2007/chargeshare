import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { isAppError } from "@/lib/errors";
import { hostStatement, parseRange } from "@/lib/services/exports";
import { localDateString } from "@/lib/domain/time";

/** GET /api/host/exports/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD: the signed-in host's statement. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer?.roles.includes("host")) return new NextResponse("Not found", { status: 404 });
  try {
    const range = parseRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
    const csv = await hostStatement(await getDb(), viewer, range);
    return csvResponse(`chargeshare-earnings-${localDateString(new Date(), "Asia/Kolkata")}.csv`, csv);
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
