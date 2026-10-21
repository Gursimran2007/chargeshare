import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";
import { currentPaymentMode } from "@/lib/payments";

/** Liveness/readiness probe. Reports configuration state without exposing secrets. */
export async function GET() {
  const payments = currentPaymentMode();
  try {
    const db = await getDb();
    await db.query("select 1");
    return NextResponse.json({
      status: "ok",
      database: db.kind,
      demoMode: config.demoMode,
      auth: config.authProvider,
      payments: payments.ok ? payments.provider : "unavailable",
    });
  } catch (e) {
    console.error("[health]", e);
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
