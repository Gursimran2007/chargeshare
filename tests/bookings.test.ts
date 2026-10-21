import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import type { Actor } from "@/lib/services/common";
import { createDemoProvider } from "@/lib/payments/demo";
import {
  cancelBooking,
  checkIn,
  createBooking,
  createReview,
  hostSessionUpdate,
  quoteBooking,
  respondToRequest,
  sendMessage,
} from "@/lib/services/bookings";
import { capturePayment, startPayment } from "@/lib/services/payments";
import { restrictUser } from "@/lib/services/admin";
import { moderateListing } from "@/lib/services/verification";
import { actorByEmail, defaultVehicle, expectAppError, istDate, listingByTitle, releaseHolds, seededDb } from "./helpers";

const provider = createDemoProvider("demo-payment-secret", "demo-webhook-secret");

let db: Db;
let driver: Actor, driver2: Actor, host: Actor, admin: Actor;
let adyar: { id: string; host_id: string };
let nexon: string, creta: string, comet: string;

async function pay(who: Actor, bookingId: string) {
  const p = await startPayment(db, who, bookingId, provider);
  const sim = provider.simulateCheckout(p.provider_order_id);
  return capturePayment(db, provider, { orderId: p.provider_order_id, paymentId: sim.paymentId, signature: sim.signature, source: "checkout" });
}

beforeAll(async () => {
  db = await seededDb();
  driver = await actorByEmail(db, "driver@chargeshare.demo");
  driver2 = await actorByEmail(db, "driver2@chargeshare.demo");
  host = await actorByEmail(db, "host@chargeshare.demo");
  admin = await actorByEmail(db, "admin@chargeshare.demo");
  adyar = await listingByTitle(db, "Adyar bridge");
  nexon = await defaultVehicle(db, driver.userId);
  creta = await defaultVehicle(db, driver2.userId);
  const { rows } = await db.query<{ id: string }>("select id from public.vehicles where owner_id = $1 and model = 'Comet EV'", [driver.userId]);
  comet = rows[0].id;
});
afterAll(() => db.close());
beforeEach(() => releaseHolds(db));

describe("server-side pricing", () => {
  it("prices from the listing and platform commission, ignoring anything the client sends", async () => {
    const req = { listingId: adyar.id, date: istDate(10), startTime: "10:00", durationMinutes: 120, vehicleId: nexon, note: "", amountPaise: 1 } as never;
    const b = await createBooking(db, driver, req);
    const { rows } = await db.query<{ amount_paise: number; commission_paise: number; host_share_paise: number }>(
      "select amount_paise, commission_paise, host_share_paise from public.bookings where id = $1",
      [b.bookingId],
    );
    expect(rows[0]).toEqual({ amount_paise: 24000, commission_paise: 3600, host_share_paise: 20400 }); // ₹120/h × 2h at 15%
  });

  it("uses the commission configured at booking time", async () => {
    await db.query("update public.platform_settings set value = '1000' where key = 'commission_bps'");
    const q = await quoteBooking(db, driver.userId, { listingId: adyar.id, date: istDate(11), startTime: "10:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    expect(q.price.commissionPaise).toBe(1200);
    await db.query("update public.platform_settings set value = '1500' where key = 'commission_bps'");
  });
});

describe("availability & conflicts", () => {
  it("rejects an overlapping booking, including the host's buffer", async () => {
    const date = istDate(12);
    await createBooking(db, driver, { listingId: adyar.id, date, startTime: "14:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await expectAppError(
      createBooking(db, driver2, { listingId: adyar.id, date, startTime: "14:30", durationMinutes: 60, vehicleId: creta, note: "" }),
      "unavailable",
    );
    // 15:00 starts inside the 15-minute buffer after the 14:00–15:00 slot.
    await expectAppError(
      createBooking(db, driver2, { listingId: adyar.id, date, startTime: "15:00", durationMinutes: 60, vehicleId: creta, note: "" }),
      "unavailable",
    );
    await createBooking(db, driver2, { listingId: adyar.id, date, startTime: "15:30", durationMinutes: 60, vehicleId: creta, note: "" });
  });

  it("lets exactly one of two simultaneous requests win", async () => {
    const date = istDate(13);
    const results = await Promise.allSettled([
      createBooking(db, driver, { listingId: adyar.id, date, startTime: "09:00", durationMinutes: 120, vehicleId: nexon, note: "" }),
      createBooking(db, driver2, { listingId: adyar.id, date, startTime: "10:00", durationMinutes: 120, vehicleId: creta, note: "" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("is backed by a database exclusion constraint, not just application checks", async () => {
    await createBooking(db, driver, { listingId: adyar.id, date: istDate(19), startTime: "14:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    const { rows } = await db.query<Record<string, unknown>>(
      "select * from public.bookings where listing_id = $1 and status = 'pending_payment' limit 1",
      [adyar.id],
    );
    const b = rows[0];
    await expect(
      db.query(
        `insert into public.bookings (code, listing_id, driver_id, host_id, status, start_at, end_at, block_end_at, duration_minutes,
           price_per_hour_paise, amount_paise, commission_bps, commission_paise, host_share_paise, cancellation_policy)
         values ('CS-RAW', $1, $2, $3, 'confirmed', $4, $5, $5, 60, 100, 100, 0, 0, 100, 'moderate')`,
        [b.listing_id, b.driver_id, b.host_id, b.start_at, b.end_at],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("releases an unpaid hold after it expires", async () => {
    const date = istDate(14);
    const first = await createBooking(db, driver, { listingId: adyar.id, date, startTime: "16:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    const later = new Date(Date.now() + 20 * 60000); // past the 15-minute hold
    const second = await createBooking(db, driver2, { listingId: adyar.id, date, startTime: "16:00", durationMinutes: 60, vehicleId: creta, note: "" }, later);
    const { rows } = await db.query<{ status: string }>("select status from public.bookings where id = $1", [first.bookingId]);
    expect(rows[0].status).toBe("expired");
    expect(second.status).toBe("pending_payment");
  });

  it("refuses hours outside the listing's schedule", async () => {
    await expectAppError(
      createBooking(db, driver, { listingId: adyar.id, date: istDate(15), startTime: "22:00", durationMinutes: 60, vehicleId: nexon, note: "" }),
      "unavailable",
    );
  });
});

describe("compatibility & eligibility", () => {
  it("refuses a vehicle without the charger's connector", async () => {
    const velachery = await listingByTitle(db, "Velachery");
    await expectAppError(
      createBooking(db, driver2, { listingId: velachery.id, date: istDate(10), startTime: "10:00", durationMinutes: 60, vehicleId: creta, note: "" }),
      "invalid",
    );
    // The Comet profile lists Bharat AC-001, so it can book.
    await createBooking(db, driver, { listingId: velachery.id, date: istDate(10), startTime: "10:00", durationMinutes: 60, vehicleId: comet, note: "" });
  });

  it("refuses someone else's vehicle (IDOR)", async () => {
    await expectAppError(
      createBooking(db, driver, { listingId: adyar.id, date: istDate(16), startTime: "10:00", durationMinutes: 60, vehicleId: creta, note: "" }),
      "invalid",
    );
  });

  it("stops hosts booking their own charger and blocks restricted accounts", async () => {
    await db.query("insert into public.vehicles (owner_id, make, model, connectors) values ($1, 'Tata', 'Nexon', '{type2_ac}')", [host.userId]);
    const hostVehicle = await defaultVehicle(db, host.userId);
    await expectAppError(
      createBooking(db, host, { listingId: adyar.id, date: istDate(16), startTime: "10:00", durationMinutes: 60, vehicleId: hostVehicle, note: "" }),
      "invalid",
    );
    await restrictUser(db, admin, driver2.userId, true, "Test restriction");
    const restricted = (await actorByEmail(db, "driver2@chargeshare.demo"))!;
    await expectAppError(
      createBooking(db, restricted, { listingId: adyar.id, date: istDate(17), startTime: "10:00", durationMinutes: 60, vehicleId: creta, note: "" }),
      "forbidden",
    );
    await restrictUser(db, admin, driver2.userId, false, "");
  });
});

describe("anti-griefing", () => {
  it("caps how many unpaid or pending slots one driver can hold", async () => {
    for (const d of [40, 41, 42]) {
      await createBooking(db, driver2, { listingId: adyar.id, date: istDate(d), startTime: "10:00", durationMinutes: 60, vehicleId: creta, note: "" });
    }
    const err = await expectAppError(
      createBooking(db, driver2, { listingId: adyar.id, date: istDate(43), startTime: "10:00", durationMinutes: 60, vehicleId: creta, note: "" }),
      "invalid",
    );
    expect(err.message).toMatch(/unpaid or pending/);
  });
});

describe("safety cascade", () => {
  it("suspending a listing cancels and fully refunds its upcoming bookings", async () => {
    const guindy = await listingByTitle(db, "Guindy business park");
    const b = await createBooking(db, driver, { listingId: guindy.id, date: istDate(44), startTime: "19:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    await moderateListing(db, admin, guindy.id, "suspend", "Reported sparking at the socket", () => provider);
    const { rows } = await db.query<{ status: string; refunded: number }>(
      "select status, (select coalesce(sum(amount_paise), 0)::int from public.refunds r where r.booking_id = b.id) as refunded from public.bookings b where id = $1",
      [b.bookingId],
    );
    expect(rows[0]).toEqual({ status: "cancelled", refunded: 13000 });
    const { rows: n } = await db.query("select 1 from public.notifications where user_id = $1 and title like $2", [driver.userId, "%cancelled by ChargeShare%"]);
    expect(n.length).toBeGreaterThan(0);
  });
});

describe("lifecycle", () => {
  it("request-to-book: host accepts, driver pays, booking confirmed", async () => {
    const kot = await listingByTitle(db, "Kotturpuram");
    const b = await createBooking(db, driver, { listingId: kot.id, date: istDate(20), startTime: "18:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    expect(b.status).toBe("requested");
    await expectAppError(startPayment(db, driver, b.bookingId, provider), "invalid"); // cannot pay before acceptance
    await expectAppError(respondToRequest(db, await actorByEmail(db, "hotel@chargeshare.demo"), b.bookingId, true), "not_found");
    await respondToRequest(db, host, b.bookingId, true);
    const r = await pay(driver, b.bookingId);
    expect(r.outcome).toBe("confirmed");
  });

  it("session check-in, host completion and a single review", async () => {
    const date = istDate(21);
    const b = await createBooking(db, driver, { listingId: adyar.id, date, startTime: "10:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    const start = new Date(`${date}T10:00:00+05:30`);
    await expectAppError(checkIn(db, driver, b.bookingId, new Date(start.getTime() - 3 * 3600_000)), "invalid");
    await checkIn(db, driver, b.bookingId, new Date(start.getTime() - 10 * 60000));
    await expectAppError(hostSessionUpdate(db, driver, b.bookingId, "start", start), "forbidden");
    await hostSessionUpdate(db, host, b.bookingId, "start", start);
    await expectAppError(createReview(db, driver, { bookingId: b.bookingId, rating: 5, comment: "" }), "invalid");
    await hostSessionUpdate(db, host, b.bookingId, "complete", new Date(start.getTime() + 3600_000));
    const { rows } = await db.query<{ completion_method: string }>("select completion_method from public.bookings where id = $1", [b.bookingId]);
    expect(rows[0].completion_method).toBe("host_confirmed");
    await createReview(db, driver, { bookingId: b.bookingId, rating: 4, comment: "Good" });
    await expectAppError(createReview(db, driver, { bookingId: b.bookingId, rating: 1, comment: "" }), "conflict");
  });

  it("masks phone numbers and emails in messages and keeps strangers out", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.bookings where driver_id = $1 and status = 'confirmed' limit 1", [driver.userId]);
    const masked = await sendMessage(db, driver, rows[0].id, "Call me on +91 98765 43210 or mail me@example.com");
    expect(masked).not.toMatch(/98765|example\.com/);
    await expectAppError(sendMessage(db, driver2, rows[0].id, "hi"), "not_found");
  });
});

describe("cancellation & refunds", () => {
  it("driver cancelling 24h+ ahead (moderate) gets a full refund, and the ledger reverses both sides", async () => {
    const b = await createBooking(db, driver, { listingId: adyar.id, date: istDate(25), startTime: "11:00", durationMinutes: 120, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    const out = await cancelBooking(db, driver, provider, b.bookingId, "change of plans");
    expect(out.refund?.amountPaise).toBe(24000);
    const { rows } = await db.query<{ t: string; s: number }>(
      "select entry_type::text as t, sum(amount_paise)::int as s from public.ledger_entries where booking_id = $1 group by entry_type",
      [b.bookingId],
    );
    const sum = Object.fromEntries(rows.map((r) => [r.t, r.s]));
    expect(sum.host_share).toBe(0);
    expect(sum.platform_commission).toBe(0);
    expect(sum.refund).toBe(sum.booking_gross);
  });

  it("driver cancelling inside 24h (moderate) gets 50%", async () => {
    const date = istDate(30);
    const b = await createBooking(db, driver, { listingId: adyar.id, date, startTime: "11:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    const fiveHoursBefore = new Date(new Date(`${date}T11:00:00+05:30`).getTime() - 5 * 3600_000);
    const out = await cancelBooking(db, driver, provider, b.bookingId, "", fiveHoursBefore);
    expect(out.refund?.amountPaise).toBe(6000);
    expect(out.decision.percent).toBe(50);
  });

  it("host cancellation always refunds in full; strangers cannot cancel", async () => {
    const b = await createBooking(db, driver, { listingId: adyar.id, date: istDate(31), startTime: "11:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    await expectAppError(cancelBooking(db, driver2, provider, b.bookingId, ""), "not_found");
    const out = await cancelBooking(db, host, provider, b.bookingId, "charger maintenance");
    expect(out.refund?.amountPaise).toBe(12000);
  });

  it("an in-progress session cannot be cancelled", async () => {
    const date = istDate(32);
    const b = await createBooking(db, driver, { listingId: adyar.id, date, startTime: "11:00", durationMinutes: 60, vehicleId: nexon, note: "" });
    await pay(driver, b.bookingId);
    await hostSessionUpdate(db, host, b.bookingId, "start", new Date(`${date}T11:00:00+05:30`));
    await expectAppError(cancelBooking(db, driver, provider, b.bookingId, ""), "invalid");
  });
});
