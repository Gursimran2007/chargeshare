import { AppError } from "@/lib/errors";
import { bpsOf } from "@/lib/money";
import type { PaymentProvider } from "@/lib/payments/types";
import { audit, adminIds, getSettingNumber, notify, requireRole, type Actor, type Db, type Queryable } from "./common";

interface BookingRow {
  id: string;
  code: string;
  driver_id: string;
  host_id: string;
  listing_id: string;
  status: string;
  amount_paise: number;
  commission_paise: number;
  host_share_paise: number;
  hold_expires_at: Date | null;
  is_demo: boolean;
}

interface PaymentRow {
  id: string;
  booking_id: string;
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  amount_paise: number;
  status: string;
}

/** Create (or return the existing) provider order for a booking awaiting payment. Idempotent. */
export async function startPayment(db: Db, actor: Actor | null, bookingId: string, provider: PaymentProvider, now = new Date()) {
  requireRole(actor, "driver");
  const booking = await db.tx(async (q) => {
    const { rows } = await q.query<BookingRow>("select * from public.bookings where id = $1 for update", [bookingId]);
    const b = rows[0];
    if (!b || b.driver_id !== actor.userId) throw new AppError("not_found", "Booking not found.");
    if (b.status !== "pending_payment") throw new AppError("invalid", "This booking is not awaiting payment.");
    if (b.hold_expires_at && new Date(b.hold_expires_at) < now) {
      const { rows: live } = await q.query("select 1 from public.payments where booking_id = $1 and status = 'created'", [b.id]);
      if (!live[0]) {
        await q.query("update public.bookings set status = 'expired' where id = $1", [b.id]);
        await q.query(
          "insert into public.booking_events (booking_id, from_status, to_status, actor_role, note) values ($1, 'pending_payment', 'expired', 'system', 'Payment window elapsed')",
          [b.id],
        );
      }
    }
    return b;
  });
  if (booking.hold_expires_at && new Date(booking.hold_expires_at) < now) {
    const existing = await livePayment(db, bookingId);
    if (!existing) throw new AppError("unavailable", "The payment window for this booking has closed. Please book again.");
  }
  const existing = await livePayment(db, bookingId);
  if (existing) return existing;

  const attempts = (await db.query<{ n: number }>("select count(*)::int as n from public.payments where booking_id = $1", [bookingId]))
    .rows[0].n;
  const order = await provider.createOrder({
    amountPaise: booking.amount_paise,
    receipt: booking.code,
    notes: { booking_id: booking.id, booking_code: booking.code },
  });
  const { rows } = await db.query<PaymentRow>(
    `insert into public.payments (booking_id, provider, provider_order_id, amount_paise, idempotency_key, raw)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (booking_id) where status in ('created', 'captured') do nothing
     returning *`,
    [bookingId, provider.name, order.orderId, booking.amount_paise, `booking:${bookingId}:attempt:${attempts + 1}`, JSON.stringify(order.raw)],
  );
  return rows[0] ?? (await livePayment(db, bookingId))!;
}

async function livePayment(q: Queryable, bookingId: string) {
  const { rows } = await q.query<PaymentRow>(
    "select * from public.payments where booking_id = $1 and status in ('created', 'captured') limit 1",
    [bookingId],
  );
  return rows[0] ?? null;
}

async function writeCaptureLedger(q: Queryable, b: BookingRow, p: PaymentRow) {
  const taxBps = await getSettingNumber(q, "tax_on_commission_bps");
  const feeBps = await getSettingNumber(q, "processing_fee_bps");
  const entries: [string, number, string | null, boolean, string][] = [
    ["booking_gross", b.amount_paise, null, false, `Driver payment for ${b.code}`],
    ["host_share", b.host_share_paise, b.host_id, false, `Host share for ${b.code}`],
    ["platform_commission", b.commission_paise, null, false, `Commission on ${b.code}`],
    ["tax_on_commission", bpsOf(b.commission_paise, taxBps), null, true, "Estimated GST on commission"],
    ["processing_fee", bpsOf(b.amount_paise, feeBps), null, true, "Estimated gateway fee (actual comes from settlement report)"],
  ];
  for (const [type, amount, hostId, estimate, memo] of entries) {
    await q.query(
      `insert into public.ledger_entries (booking_id, payment_id, host_id, entry_type, amount_paise, is_estimate, memo)
       values ($1, $2, coalesce($3::uuid, $6::uuid), $4, $5, $7, $8)
       on conflict do nothing`,
      [b.id, p.id, hostId, type, amount, b.host_id, estimate, memo],
    );
  }
}

export type CaptureResult = { bookingId: string; outcome: "confirmed" | "duplicate" | "late_refunded" };

/**
 * Marks a payment captured and confirms its booking. Shared by the browser
 * callback (after signature verification) and the webhook. Safe to call any
 * number of times for the same payment.
 */
export async function capturePayment(
  db: Db,
  provider: PaymentProvider,
  input: { orderId: string; paymentId: string; signature?: string; amountPaise?: number; source: "checkout" | "webhook" },
): Promise<CaptureResult> {
  if (input.source === "checkout") {
    if (!input.signature || !provider.verifyPaymentSignature({ orderId: input.orderId, paymentId: input.paymentId, signature: input.signature })) {
      throw new AppError("payment_failed", "We could not verify this payment. You have not been charged twice; contact support if money left your account.");
    }
  }
  let lateRefund: { booking: BookingRow; payment: PaymentRow } | null = null;
  let mismatch: { paymentId: string; expected: number } | null = null;
  const result = await db.tx(async (q): Promise<CaptureResult> => {
    const { rows } = await q.query<PaymentRow>(
      "select * from public.payments where provider = $1 and provider_order_id = $2 for update",
      [provider.name, input.orderId],
    );
    const p = rows[0];
    if (!p) throw new AppError("not_found", "Payment order not found.");
    if (p.status === "captured" || p.status === "refunded" || p.status === "partially_refunded") {
      if (p.provider_payment_id !== input.paymentId) {
        await audit(q, null, "payment.second_capture_on_order", "payment", p.id, {
          after: { order: input.orderId, payment: input.paymentId },
          reason: "A second payment was reported for an order that was already paid. Review and refund if needed.",
        });
        for (const id of await adminIds(q)) {
          await notify(q, id, { type: "payment_anomaly", title: "Second payment on a paid order", body: input.orderId, link: "/admin/bookings" });
        }
      }
      return { bookingId: p.booking_id, outcome: "duplicate" };
    }
    if (input.amountPaise !== undefined && input.amountPaise !== p.amount_paise) {
      mismatch = { paymentId: p.id, expected: p.amount_paise };
      return { bookingId: p.booking_id, outcome: "duplicate" };
    }
    await q.query(
      "update public.payments set status = 'captured', provider_payment_id = $2, captured_at = now(), failure_reason = null where id = $1",
      [p.id, input.paymentId],
    );
    const captured = { ...p, status: "captured", provider_payment_id: input.paymentId };
    const { rows: br } = await q.query<BookingRow>("select * from public.bookings where id = $1 for update", [p.booking_id]);
    const b = br[0];
    await writeCaptureLedger(q, b, captured);
    if (b.status !== "pending_payment") {
      // Paid after the slot was released: refund in full outside this transaction.
      lateRefund = { booking: b, payment: captured };
      return { bookingId: b.id, outcome: "late_refunded" };
    }
    await q.query("update public.bookings set status = 'confirmed', confirmed_at = now(), hold_expires_at = null where id = $1", [b.id]);
    await q.query(
      "insert into public.booking_events (booking_id, from_status, to_status, actor_role, note) values ($1, 'pending_payment', 'confirmed', 'system', $2)",
      [b.id, `Payment verified via ${input.source}`],
    );
    await notify(q, b.driver_id, {
      type: "booking_confirmed",
      title: `Booking ${b.code} confirmed`,
      body: "Access instructions and the exact address are now on your booking page.",
      link: `/bookings/${b.id}`,
      email: true,
    });
    await notify(q, b.host_id, {
      type: "booking_confirmed",
      title: `New confirmed booking ${b.code}`,
      body: "A driver has booked and paid for a session at your charger.",
      link: `/host/bookings`,
      email: true,
    });
    return { bookingId: b.id, outcome: "confirmed" };
  });
  if (mismatch) {
    // Recorded outside the capture transaction so the flag is not rolled back.
    const m = mismatch as { paymentId: string; expected: number };
    await db.tx(async (q) => {
      await q.query("update public.payments set status = 'failed', failure_reason = $2 where id = $1 and status = 'created'", [
        m.paymentId,
        `Amount mismatch: expected ${m.expected}, got ${input.amountPaise}`,
      ]);
      await audit(q, null, "payment.amount_mismatch", "payment", m.paymentId, { after: { expected: m.expected, got: input.amountPaise } });
    });
    throw new AppError("payment_failed", "Payment amount did not match the booking.");
  }
  if (lateRefund) {
    const { booking, payment } = lateRefund as { booking: BookingRow; payment: PaymentRow };
    await db.tx((q) =>
      issueRefund(q, provider, {
        booking,
        payment,
        amountPaise: booking.amount_paise,
        reason: "Payment received after the booking had expired or been cancelled",
        actorId: null,
        role: "system",
      }),
    );
  }
  return result;
}

export async function markPaymentFailed(db: Db, provider: PaymentProvider, orderId: string, reason: string) {
  await db.query(
    "update public.payments set status = 'failed', failure_reason = $3 where provider = $1 and provider_order_id = $2 and status = 'created'",
    [provider.name, orderId, reason.slice(0, 300)],
  );
}

/**
 * Refunds part or all of a captured payment and books the reversal in the
 * ledger, split proportionally between host share and commission.
 * Callers must have already authorised the refund (system policy or admin).
 */
export async function issueRefund(
  q: Queryable,
  provider: PaymentProvider,
  i: {
    booking: { id: string; code: string; driver_id: string; host_id: string; amount_paise: number; commission_paise: number };
    payment?: PaymentRow;
    amountPaise: number;
    reason: string;
    actorId: string | null;
    role: "system" | "admin" | "driver" | "host";
    policySnapshot?: unknown;
  },
) {
  const payment =
    i.payment ??
    (await q.query<PaymentRow>(
      "select * from public.payments where booking_id = $1 and status in ('captured', 'partially_refunded') for update",
      [i.booking.id],
    )).rows[0];
  if (!payment) throw new AppError("invalid", "There is no captured payment to refund.");
  const { rows: prior } = await q.query<{ total: number }>(
    "select coalesce(sum(amount_paise), 0)::int as total from public.refunds where payment_id = $1 and status <> 'failed'",
    [payment.id],
  );
  const remaining = payment.amount_paise - prior[0].total;
  if (i.amountPaise <= 0 || i.amountPaise > remaining) {
    throw new AppError("invalid", `Refund must be between ₹0.01 and ${(remaining / 100).toFixed(2)}.`);
  }
  const commissionPortion = Math.round((i.booking.commission_paise * i.amountPaise) / i.booking.amount_paise);
  const hostPortion = i.amountPaise - commissionPortion;
  const r = await provider.refund({
    paymentId: payment.provider_payment_id!,
    amountPaise: i.amountPaise,
    notes: { booking_code: i.booking.code, reason: i.reason.slice(0, 200) },
  });
  const { rows } = await q.query<{ id: string }>(
    `insert into public.refunds (booking_id, payment_id, amount_paise, host_portion_paise, commission_portion_paise, reason,
       policy_snapshot, status, provider_refund_id, initiated_by, initiated_role, processed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::refund_status, $9, $10, $11, case when $8::refund_status = 'processed' then now() end) returning id`,
    [
      i.booking.id, payment.id, i.amountPaise, hostPortion, commissionPortion, i.reason,
      JSON.stringify(i.policySnapshot ?? {}), r.status, r.refundId, i.actorId, i.role,
    ],
  );
  const refundId = rows[0].id;
  const taxBps = await getSettingNumber(q, "tax_on_commission_bps");
  const entries: [string, number, boolean, string][] = [
    ["refund", i.amountPaise, false, `Refund to driver for ${i.booking.code}`],
    ["host_share", -hostPortion, false, `Host share reversed (refund ${i.booking.code})`],
    ["platform_commission", -commissionPortion, false, `Commission reversed (refund ${i.booking.code})`],
    ["tax_on_commission", -bpsOf(commissionPortion, taxBps), true, "Estimated GST reversal"],
  ];
  for (const [type, amount, estimate, memo] of entries) {
    await q.query(
      `insert into public.ledger_entries (booking_id, payment_id, refund_id, host_id, entry_type, amount_paise, is_estimate, memo)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [i.booking.id, payment.id, refundId, i.booking.host_id, type, amount, estimate, memo],
    );
  }
  const fully = prior[0].total + i.amountPaise >= payment.amount_paise;
  await q.query("update public.payments set status = $2 where id = $1", [payment.id, fully ? "refunded" : "partially_refunded"]);
  await notify(q, i.booking.driver_id, {
    type: "refund",
    title: `Refund of ₹${(i.amountPaise / 100).toFixed(2)} for ${i.booking.code}`,
    body:
      r.status === "processed"
        ? "Your refund has been processed. Banks usually take 5–7 working days to show it."
        : "Your refund has been initiated with the payment provider.",
    link: `/bookings/${i.booking.id}`,
    email: true,
  });
  return { refundId, amountPaise: i.amountPaise, status: r.status };
}

/** Admin-only manual refund (e.g. dispute or goodwill). */
export async function adminRefund(db: Db, actor: Actor | null, provider: PaymentProvider, bookingId: string, amountPaise: number, reason: string) {
  requireRole(actor, "admin");
  if (reason.trim().length < 5) throw new AppError("invalid", "A reason is required for every refund.");
  return db.tx(async (q) => {
    const { rows } = await q.query<BookingRow>("select * from public.bookings where id = $1 for update", [bookingId]);
    if (!rows[0]) throw new AppError("not_found", "Booking not found.");
    const out = await issueRefund(q, provider, { booking: rows[0], amountPaise, reason, actorId: actor.userId, role: "admin" });
    await audit(q, actor.userId, "refund.issue", "booking", bookingId, { after: out, reason });
    return out;
  });
}

/**
 * Verified webhook entry point. The caller passes the raw body and signature;
 * duplicates (same event id) are acknowledged without reprocessing.
 */
export async function handleWebhook(
  db: Db,
  provider: PaymentProvider,
  rawBody: string,
  signature: string | null,
  eventIdHeader: string | null,
): Promise<{ status: number; outcome: string }> {
  if (!provider.verifyWebhookSignature(rawBody, signature)) return { status: 400, outcome: "invalid_signature" };
  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id: string; order_id: string; amount: number; status: string; error_description?: string } };
      refund?: { entity?: { id: string; status: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, outcome: "invalid_json" };
  }
  const { createHash } = await import("node:crypto");
  const eventId = eventIdHeader || createHash("sha256").update(rawBody).digest("hex");
  const type = event.event ?? "unknown";
  const { rows } = await db.query<{ id: number }>(
    `insert into public.payment_events (provider, event_id, event_type, payload) values ($1, $2, $3, $4)
     on conflict (provider, event_id) do nothing returning id`,
    [provider.name, eventId, type, rawBody],
  );
  if (!rows[0]) return { status: 200, outcome: "duplicate_event" };
  let outcome = "ignored";
  try {
    const pay = event.payload?.payment?.entity;
    if ((type === "payment.captured" || type === "order.paid") && pay) {
      const r = await capturePayment(db, provider, { orderId: pay.order_id, paymentId: pay.id, amountPaise: pay.amount, source: "webhook" });
      outcome = r.outcome;
    } else if (type === "payment.failed" && pay) {
      await markPaymentFailed(db, provider, pay.order_id, pay.error_description ?? "Payment failed");
      outcome = "marked_failed";
    } else if (type === "refund.processed" && event.payload?.refund?.entity) {
      await db.query("update public.refunds set status = 'processed', processed_at = now() where provider_refund_id = $1", [
        event.payload.refund.entity.id,
      ]);
      outcome = "refund_processed";
    }
  } catch (e) {
    outcome = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    await db.query("update public.payment_events set outcome = $2 where id = $1", [rows[0].id, outcome]);
    // Let the provider retry; the event row is removed so the retry is processed.
    await db.query("delete from public.payment_events where id = $1", [rows[0].id]);
    return { status: 500, outcome };
  }
  await db.query("update public.payment_events set processed_at = now(), outcome = $2 where id = $1", [rows[0].id, outcome]);
  return { status: 200, outcome };
}
