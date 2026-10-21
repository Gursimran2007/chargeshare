import { hmacHex, safeEqualHex } from "./signature";
import type { PaymentProvider } from "./types";

const API = "https://api.razorpay.com/v1";

/**
 * Razorpay Standard Checkout adapter (Orders API + HMAC verification).
 * Untested against live credentials in this repository; see README "Going live".
 *  - Payment signature: HMAC_SHA256(order_id + "|" + razorpay_payment_id, key_secret)
 *  - Webhook signature: HMAC_SHA256(raw request body, webhook_secret) in X-Razorpay-Signature
 */
export function createRazorpayProvider(keyId: string, keySecret: string, webhookSecret: string): PaymentProvider {
  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error("RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required.");
  }
  const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(`Razorpay ${path} failed: ${json.error?.description ?? res.status}`);
    return json;
  }

  return {
    name: "razorpay",
    publicKeyId: keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const order = await call<{ id: string }>("/orders", { amount: amountPaise, currency: "INR", receipt, notes });
      return { orderId: order.id, raw: order };
    },
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      return safeEqualHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
    },
    async refund({ paymentId, amountPaise, notes }) {
      const r = await call<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountPaise,
        notes,
      });
      return { refundId: r.id, status: r.status === "processed" ? "processed" : "pending" };
    },
  };
}
