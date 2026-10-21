import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { activeProvider, currentPaymentMode } from "@/lib/payments";
import { capturePayment } from "@/lib/services/payments";
import { isAppError } from "@/lib/errors";

const body = z.object({
  razorpay_order_id: z.string().min(5),
  razorpay_payment_id: z.string().min(5),
  razorpay_signature: z.string().min(10),
});

/** Browser callback after Razorpay Checkout. The signature is verified server-side before anything is confirmed. */
export async function POST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment response." }, { status: 400 });
  const mode = currentPaymentMode();
  if (!mode.ok || mode.provider !== "razorpay") return NextResponse.json({ error: "Razorpay is not enabled." }, { status: 400 });
  const provider = activeProvider();
  const db = await getDb();
  const { rows } = await db.query<{ driver_id: string }>(
    "select b.driver_id from public.payments p join public.bookings b on b.id = p.booking_id where p.provider_order_id = $1",
    [parsed.data.razorpay_order_id],
  );
  if (!rows[0] || rows[0].driver_id !== viewer.userId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const r = await capturePayment(db, provider, {
      orderId: parsed.data.razorpay_order_id,
      paymentId: parsed.data.razorpay_payment_id,
      signature: parsed.data.razorpay_signature,
      source: "checkout",
    });
    return NextResponse.json({ bookingId: r.bookingId, outcome: r.outcome });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}
