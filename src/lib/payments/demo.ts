import { randomBytes } from "node:crypto";
import { hmacHex, safeEqualHex } from "./signature";
import type { PaymentProvider } from "./types";

/**
 * Simulated provider. Mirrors Razorpay's signature scheme so the exact same
 * verification and capture code runs in demo mode. No money ever moves.
 */
export function createDemoProvider(secret: string, webhookSecret: string): PaymentProvider & {
  simulateCheckout(orderId: string): { paymentId: string; signature: string };
  signWebhook(body: string): string;
} {
  return {
    name: "demo",
    publicKeyId: null,
    async createOrder() {
      const orderId = `order_DEMO${randomBytes(7).toString("hex")}`;
      return { orderId, raw: { simulated: true } };
    },
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
    },
    async refund() {
      return { refundId: `rfnd_DEMO${randomBytes(7).toString("hex")}`, status: "processed" };
    },
    simulateCheckout(orderId) {
      const paymentId = `pay_DEMO${randomBytes(7).toString("hex")}`;
      return { paymentId, signature: hmacHex(secret, `${orderId}|${paymentId}`) };
    },
    signWebhook(body) {
      return hmacHex(webhookSecret, body);
    },
  };
}
