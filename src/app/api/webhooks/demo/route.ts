import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { currentPaymentMode, demoProvider } from "@/lib/payments";
import { handleWebhook } from "@/lib/services/payments";

/** Demo-mode webhook with the same contract as Razorpay's (HMAC of the raw body). */
export async function POST(req: NextRequest) {
  const mode = currentPaymentMode();
  if (!mode.ok || mode.provider !== "demo") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const raw = await req.text();
  const r = await handleWebhook(await getDb(), demoProvider(), raw, req.headers.get("x-demo-signature"), req.headers.get("x-demo-event-id"));
  return NextResponse.json({ outcome: r.outcome }, { status: r.status });
}
