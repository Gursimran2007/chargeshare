import "server-only";
import { config } from "@/lib/config";
import { createDemoProvider } from "./demo";
import { createRazorpayProvider } from "./razorpay";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";

let demo: ReturnType<typeof createDemoProvider> | undefined;

export function demoProvider() {
  demo ??= createDemoProvider(config.payments.demoSecret, config.payments.demoWebhookSecret);
  return demo;
}

/** The provider used for new payments. Live Razorpay is refused while demo mode is on. */
export function activeProvider(): PaymentProvider {
  if (config.payments.provider === "razorpay") {
    if (config.demoMode) throw new Error("Live payments are disabled in demo mode.");
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
