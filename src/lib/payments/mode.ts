/**
 * Decides whether payments can be taken in this environment. Pure, so it can be tested.
 *
 * The rule that matters: simulated (demo) payments must never confirm bookings in a
 * deployment that holds real users' data, because that would let anyone book without paying.
 */
export interface PaymentEnv {
  provider: "demo" | "razorpay";
  demoMode: boolean;
  allowDemoPayments: boolean; // explicit opt-in for a private staging environment
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
}

export type PaymentMode =
  | { ok: true; provider: "demo" | "razorpay" }
  | { ok: false; provider: "demo" | "razorpay"; reason: string };

export function paymentMode(e: PaymentEnv): PaymentMode {
  if (e.provider === "razorpay") {
    if (e.demoMode) return { ok: false, provider: "razorpay", reason: "Live payments are disabled while demo mode is on." };
    if (!e.razorpayKeyId || !e.razorpayKeySecret || !e.razorpayWebhookSecret) {
      return { ok: false, provider: "razorpay", reason: "Razorpay is selected but RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET is missing." };
    }
    return { ok: true, provider: "razorpay" };
  }
  if (!e.demoMode && !e.allowDemoPayments) {
    return {
      ok: false,
      provider: "demo",
      reason: "Simulated payments are disabled outside demo mode. Configure Razorpay, or set ALLOW_DEMO_PAYMENTS=true for a private staging environment.",
    };
  }
  return { ok: true, provider: "demo" };
}
