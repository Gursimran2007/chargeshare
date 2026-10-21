import "server-only";
import { config, paymentEnv } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { paymentMode } from "./mode";
import { createDemoProvider } from "./demo";
import { createRazorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";

let demo: ReturnType<typeof createDemoProvider> | undefined;

export function demoProvider() {
  demo ??= createDemoProvider(config.payments.demoSecret, config.payments.demoWebhookSecret);
  return demo;
}

export function currentPaymentMode() {
  return paymentMode(paymentEnv());
}

/**
 * The provider used for new payments. Refuses (with a user-safe message) when the
 * environment is misconfigured, e.g. simulated payments outside demo mode.
 */
export function activeProvider(): PaymentProvider {
  const mode = currentPaymentMode();
  if (!mode.ok) {
    console.error(`[payments] ${mode.reason}`);
    throw new AppError("unavailable", "Payments are temporarily unavailable. Your booking is held; please try again later or contact support.");
  }
  if (mode.provider === "razorpay") {
    const p = config.payments;
    return createRazorpayProvider(p.razorpayKeyId, p.razorpayKeySecret, p.razorpayWebhookSecret);
  }
  return demoProvider();
}

export function providerByName(name: string): PaymentProvider {
  if (name === "demo") return demoProvider();
  if (name === "razorpay") return activeProvider();
  throw new Error(`unknown payment provider ${name}`);
}
