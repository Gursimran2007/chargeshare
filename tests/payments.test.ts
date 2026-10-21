import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import type { Actor } from "@/lib/services/common";
import { createDemoProvider } from "@/lib/payments/demo";
import { createRazorpayProvider } from "@/lib/payments/razorpay";
import { hmacHex } from "@/lib/payments/signature";
import { createBooking } from "@/lib/services/bookings";
import { adminRefund, capturePayment, handleWebhook, startPayment } from "@/lib/services/payments";
import { createPayout, hostEarnings, updatePayoutStatus } from "@/lib/services/finance";
import { actorByEmail, defaultVehicle, expectAppError, istDate, listingByTitle, releaseHolds, seededDb } from "./helpers";

const provider = createDemoProvider("demo-payment-secret", "demo-webhook-secret");

let db: Db;
let driver: Actor, host: Actor, admin: Actor;
let listingId: string, vehicle: string;
let day = 40;

async function newBooking() {
  const b = await createBooking(db, driver, { listingId, date: istDate(day++), startTime: "10:00", durationMinutes: 60, vehicleId: vehicle, note: "" });
  const p = await startPayment(db, driver, b.bookingId, provider);
  return { bookingId: b.bookingId, orderId: p.provider_order_id, amount: p.amount_paise };
}

function webhookBody(type: string, orderId: string, paymentId: string, amount: number) {
  return JSON.stringify({ event: type, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: "captured" } } } });
}

const ledgerCount = async (bookingId: string) =>
  (await db.query<{ n: number }>("select count(*)::int as n from public.ledger_entries where booking_id = $1", [bookingId])).rows[0].n;
const status = async (bookingId: string) =>
  (await db.query<{ status: string }>("select status from public.bookings where id = $1", [bookingId])).rows[0].status;

beforeAll(async () => {
  db = await seededDb();
  driver = await actorByEmail(db, "driver@chargeshare.demo");
  host = await actorByEmail(db, "host@chargeshare.demo");
  admin = await actorByEmail(db, "admin@chargeshare.demo");
  listingId = (await listingByTitle(db, "Adyar bridge")).id;
  vehicle = await defaultVehicle(db, driver.userId);
});
afterAll(() => db.close());
beforeEach(() => releaseHolds(db));

describe("checkout signature verification", () => {
  it("rejects a forged or tampered signature", async () => {
    const b = await newBooking();
    await expectAppError(
      capturePayment(db, provider, { orderId: b.orderId, paymentId: "pay_FAKE", signature: "0".repeat(64), source: "checkout" }),
      "payment_failed",
    );
    const sim = provider.simulateCheckout(b.orderId);
    await expectAppError(
      capturePayment(db, provider, { orderId: b.orderId, paymentId: "pay_OTHER", signature: sim.signature, source: "checkout" }),
      "payment_failed",
    );
    expect(await status(b.bookingId)).toBe("pending_payment");
  });

  it("matches Razorpay's documented HMAC scheme", () => {
    const rp = createRazorpayProvider("rzp_test_key", "secret123", "whsec");
    const sig = hmacHex("secret123", "order_1|pay_1");
    expect(rp.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig })).toBe(true);
    expect(rp.verifyPaymentSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig })).toBe(false);
    expect(rp.verifyWebhookSignature('{"a":1}', hmacHex("whsec", '{"a":1}'))).toBe(true);
    expect(rp.verifyWebhookSignature('{"a":2}', hmacHex("whsec", '{"a":1}'))).toBe(false);
  });

  it("only the booking's driver can start payment, and repeated starts reuse one order", async () => {
    const b = await newBooking();
    const again = await startPayment(db, driver, b.bookingId, provider);
    expect(again.provider_order_id).toBe(b.orderId);
    await expectAppError(startPayment(db, host, b.bookingId, provider), "not_found");
  });
});

describe("idempotent capture", () => {
  it("confirms once and books the ledger once, however many times it is called", async () => {
    const b = await newBooking();
    const sim = provider.simulateCheckout(b.orderId);
    const input = { orderId: b.orderId, paymentId: sim.paymentId, signature: sim.signature, source: "checkout" as const };
    const [r1, r2] = await Promise.all([capturePayment(db, provider, input), capturePayment(db, provider, input)]);
    expect([r1.outcome, r2.outcome].sort()).toEqual(["confirmed", "duplicate"]);
    expect(await ledgerCount(b.bookingId)).toBe(5);
    await capturePayment(db, provider, { ...input, source: "webhook", amountPaise: b.amount });
    expect(await ledgerCount(b.bookingId)).toBe(5);
    expect(await status(b.bookingId)).toBe("confirmed");
  });
});

describe("webhooks", () => {
  it("rejects an invalid signature", async () => {
    const b = await newBooking();
    const body = webhookBody("payment.captured", b.orderId, "pay_X", b.amount);
    const r = await handleWebhook(db, provider, body, "bad", "evt_1");
    expect(r.status).toBe(400);
    expect(await status(b.bookingId)).toBe("pending_payment");
  });

  it("confirms on a valid event and acknowledges duplicates without reprocessing", async () => {
    const b = await newBooking();
    const body = webhookBody("payment.captured", b.orderId, "pay_WH1", b.amount);
    const sig = provider.signWebhook(body);
    expect(await handleWebhook(db, provider, body, sig, "evt_A")).toEqual({ status: 200, outcome: "confirmed" });
    expect(await handleWebhook(db, provider, body, sig, "evt_A")).toEqual({ status: 200, outcome: "duplicate_event" });
    // A retried delivery with a new event id is still a no-op for the ledger.
    expect((await handleWebhook(db, provider, body, sig, "evt_B")).outcome).toBe("duplicate");
    expect(await ledgerCount(b.bookingId)).toBe(5);
  });

  it("refuses to confirm when the paid amount does not match", async () => {
    const b = await newBooking();
    const body = webhookBody("payment.captured", b.orderId, "pay_LOW", 100);
    const r = await handleWebhook(db, provider, body, provider.signWebhook(body), "evt_low");
    expect(r.status).toBe(500); // provider will retry; payment flagged
    expect(await status(b.bookingId)).toBe("pending_payment");
    const { rows } = await db.query<{ status: string }>("select status from public.payments where provider_order_id = $1", [b.orderId]);
    expect(rows[0].status).toBe("failed");
  });

  it("records payment.failed without touching the booking", async () => {
    const b = await newBooking();
    const body = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_F", order_id: b.orderId, amount: b.amount, status: "failed", error_description: "Card declined" } } } });
    expect((await handleWebhook(db, provider, body, provider.signWebhook(body), "evt_fail")).outcome).toBe("marked_failed");
    expect(await status(b.bookingId)).toBe("pending_payment");
  });

  it("auto-refunds a payment that arrives after the booking expired", async () => {
    const b = await newBooking();
    await db.query("update public.bookings set status = 'expired' where id = $1", [b.bookingId]);
    const body = webhookBody("payment.captured", b.orderId, "pay_LATE", b.amount);
    expect((await handleWebhook(db, provider, body, provider.signWebhook(body), "evt_late")).outcome).toBe("late_refunded");
    const { rows } = await db.query<{ amount_paise: number }>("select amount_paise from public.refunds where booking_id = $1", [b.bookingId]);
    expect(rows[0].amount_paise).toBe(b.amount);
    expect(await status(b.bookingId)).toBe("expired");
  });
});

describe("refunds and payouts", () => {
  it("never refunds more than was captured, and only admins can issue manual refunds", async () => {
    const b = await newBooking();
    const sim = provider.simulateCheckout(b.orderId);
    await capturePayment(db, provider, { orderId: b.orderId, paymentId: sim.paymentId, signature: sim.signature, source: "checkout" });
    await expectAppError(adminRefund(db, host, provider, b.bookingId, 100, "goodwill"), "forbidden");
    await expectAppError(adminRefund(db, driver, provider, b.bookingId, 100, "goodwill"), "forbidden");
    await adminRefund(db, admin, provider, b.bookingId, 5000, "partial goodwill");
    await expectAppError(adminRefund(db, admin, provider, b.bookingId, b.amount, "too much"), "invalid");
    const { rows } = await db.query<{ status: string }>("select status from public.payments where provider_order_id = $1", [b.orderId]);
    expect(rows[0].status).toBe("partially_refunded");
  });

  it("host earnings reconcile with the ledger; payouts only from completed sessions and only by admins", async () => {
    const e = await hostEarnings(db, host.userId);
    expect(e.grossBookingPaise - e.refundsPaise).toBe(e.netEarningsPaise + e.commissionPaise);
    expect(e.availablePaise).toBe(Math.max(0, e.eligiblePaise - e.paidOutPaise - e.inFlightPayoutPaise));
    await expectAppError(createPayout(db, host, host.userId, "self-serve"), "forbidden");
    // The seed already paid out everything eligible.
    await expectAppError(createPayout(db, admin, host.userId, "again"), "invalid");
  });

  it("payout status moves forward only, and paid payouts need a reference", async () => {
    const office = await actorByEmail(db, "office@chargeshare.demo");
    const id = await createPayout(db, admin, office.userId, "Test");
    await expectAppError(updatePayoutStatus(db, admin, id, "paid", ""), "invalid");
    await updatePayoutStatus(db, admin, id, "paid", "UTR123456");
    await expectAppError(updatePayoutStatus(db, admin, id, "failed", ""), "invalid");
    const after = await hostEarnings(db, office.userId);
    expect(after.availablePaise).toBe(0);
  });
});
