import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import { paymentMode, type PaymentEnv } from "@/lib/payments/mode";
import { rateLimit } from "@/lib/services/rate-limit";
import { sweepExpiredBookings } from "@/lib/services/maintenance";
import { createBooking } from "@/lib/services/bookings";
import { track } from "@/lib/services/analytics";
import { platformMetrics } from "@/lib/services/finance";
import { actorByEmail, defaultVehicle, expectAppError, istDate, listingByTitle, seededDb } from "./helpers";

const base: PaymentEnv = { provider: "demo", demoMode: true, allowDemoPayments: false, razorpayKeyId: "", razorpayKeySecret: "", razorpayWebhookSecret: "" };

describe("payment mode guard", () => {
  it("allows simulated payments only in demo mode or with an explicit staging opt-in", () => {
    expect(paymentMode(base)).toEqual({ ok: true, provider: "demo" });
    expect(paymentMode({ ...base, demoMode: false }).ok).toBe(false);
    expect(paymentMode({ ...base, demoMode: false, allowDemoPayments: true }).ok).toBe(true);
  });
  it("refuses Razorpay in demo mode or without all three secrets", () => {
    expect(paymentMode({ ...base, provider: "razorpay" }).ok).toBe(false);
    expect(paymentMode({ ...base, provider: "razorpay", demoMode: false, razorpayKeyId: "k", razorpayKeySecret: "s" }).ok).toBe(false);
    expect(paymentMode({ ...base, provider: "razorpay", demoMode: false, razorpayKeyId: "k", razorpayKeySecret: "s", razorpayWebhookSecret: "w" })).toEqual({ ok: true, provider: "razorpay" });
  });
});

describe("operations", () => {
  let db: Db;
  beforeAll(async () => {
    db = await seededDb();
  });
  afterAll(() => db.close());

  it("rate limits after the configured number of hits, per key", async () => {
    for (let i = 0; i < 3; i++) await rateLimit(db, "t:a", 3, 60);
    await expectAppError(rateLimit(db, "t:a", 3, 60), "rate_limited");
    await rateLimit(db, "t:b", 3, 60);
    await db.query("update internal.rate_limits set window_start = now() - interval '2 minutes' where key = 't:a'");
    await rateLimit(db, "t:a", 3, 60); // window rolled over
  });

  it("sweeps expired holds platform-wide, frees the slot and tells the driver", async () => {
    const driver = await actorByEmail(db, "driver@chargeshare.demo");
    const driver2 = await actorByEmail(db, "driver2@chargeshare.demo");
    const listing = await listingByTitle(db, "Sholinganallur");
    const date = istDate(9);
    const b = await createBooking(db, driver, { listingId: listing.id, date, startTime: "12:00", durationMinutes: 60, vehicleId: await defaultVehicle(db, driver.userId), note: "" });
    expect(await sweepExpiredBookings(db)).toBe(0); // still inside the hold
    const n = await sweepExpiredBookings(db, new Date(Date.now() + 16 * 60000));
    expect(n).toBeGreaterThanOrEqual(1);
    const { rows } = await db.query<{ status: string }>("select status from public.bookings where id = $1", [b.bookingId]);
    expect(rows[0].status).toBe("expired");
    const { rows: notes } = await db.query("select 1 from public.notifications where user_id = $1 and type = 'booking_expired'", [driver.userId]);
    expect(notes.length).toBe(1);
    // The seeded Kotturpuram request has a 12-hour response window, so it is untouched.
    const { rows: req } = await db.query<{ n: number }>("select count(*)::int as n from public.bookings where status = 'requested'");
    expect(req[0].n).toBe(1);
    // The released slot can be booked again.
    await createBooking(db, driver2, { listingId: listing.id, date, startTime: "12:00", durationMinutes: 60, vehicleId: await defaultVehicle(db, driver2.userId), note: "" });
  });

  it("reports funnel conversion from tracked events", async () => {
    for (const [ev, vid] of [["search", "v1"], ["search", "v2"], ["listing_view", "v1"], ["booking_request", "v1"]] as const) {
      await track(db, ev, { visitorId: vid, isDemo: true });
    }
    const m = await platformMetrics(db);
    expect(m.funnel).toMatchObject({ searchVisitors: 2, listingVisitors: 1, bookingVisitors: 1, searchToListing: 0.5, listingToBooking: 1 });
    expect(m.bookingCompletionRate).toBeGreaterThan(0);
  });
});
