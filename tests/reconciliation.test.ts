import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import { reconcile } from "@/lib/services/reconciliation";
import { seededDb } from "./helpers";

describe("financial reconciliation", () => {
  let db: Db;
  beforeAll(async () => {
    db = await seededDb();
  });
  afterAll(() => db.close());

  it("passes every check on data produced by the real services (captures, refunds, disputes, payouts)", async () => {
    const checks = await reconcile(db);
    expect(checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.offenders.map((o) => o.detail).join("; ")}`)).toEqual([]);
    expect(checks.length).toBe(9);
  });

  it("flags a captured payment that never reached the ledger", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.bookings where status = 'requested' limit 1");
    await db.query(
      `insert into public.payments (booking_id, provider, provider_order_id, provider_payment_id, amount_paise, status, idempotency_key, captured_at)
       values ($1, 'demo', 'order_TAMPER', 'pay_TAMPER', 100, 'captured', 'tamper-1', now())`,
      [rows[0].id],
    );
    const checks = await reconcile(db);
    const failed = checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toContain("capture_posted");
    expect(failed).toContain("payment_matches_booking");
  });

  it("flags a booking marked confirmed without a captured payment", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.bookings where status = 'requested' limit 1");
    await db.query("delete from public.payments where provider_order_id = 'order_TAMPER'");
    await db.query("update public.bookings set status = 'confirmed' where id = $1", [rows[0].id]);
    const c = (await reconcile(db)).find((x) => x.id === "paid_states_have_payment")!;
    expect(c.ok).toBe(false);
    expect(c.offenders[0].bookingId).toBe(rows[0].id);
  });
});
