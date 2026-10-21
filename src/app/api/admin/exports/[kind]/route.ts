import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { isAppError } from "@/lib/errors";
import { adminExport, EXPORT_KINDS, parseRange, type ExportKind } from "@/lib/services/exports";
import { localDateString } from "@/lib/domain/time";

/** GET /api/admin/exports/{ledger|payouts|bookings|refunds}?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/exports/[kind]">) {
  const { kind } = await ctx.params;
  const viewer = await getViewer();
  // Non-admins get the same 404 as an unknown export.
  if (!viewer?.roles.includes("admin") || !EXPORT_KINDS.includes(kind as ExportKind)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const range = parseRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
    const csv = await adminExport(await getDb(), viewer, kind as ExportKind, range);
    const stamp = localDateString(new Date(), "Asia/Kolkata");
    return csvResponse(`chargeshare-${kind}-${range.from ?? "start"}-to-${range.to ?? stamp}.csv`, csv);
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
