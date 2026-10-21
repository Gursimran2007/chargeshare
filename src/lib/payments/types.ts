export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}

export interface PaymentProvider {
  name: "demo" | "razorpay";
  /** Public key id for the browser checkout, if any. Never a secret. */
  publicKeyId: string | null;
  createOrder(i: CreateOrderInput): Promise<{ orderId: string; raw: unknown }>;
  /** Verifies the signature returned to the browser after checkout. */
  verifyPaymentSignature(i: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Verifies a webhook body against its signature header. Must use the raw body. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;
  refund(i: { paymentId: string; amountPaise: number; notes: Record<string, string> }): Promise<{
    refundId: string;
    status: "pending" | "processed";
  }>;
}
