import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { activeProvider } from "@/lib/payments";
import { handleWebhook } from "@/lib/services/payments";

/** Razorpay webhook. Signature is checked against the exact raw body; duplicate events are acknowledged once. */
export async function POST(req: NextRequest) {
  const provider = activeProvider();
  if (provider.name !== "razorpay") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const raw = await req.text();
  const r = await handleWebhook(await getDb(), provider, raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
  return NextResponse.json({ outcome: r.outcome }, { status: r.status });
}
