import { describe, expect, it } from "vitest";
import { estimateContribution, quotePrice } from "@/lib/domain/pricing";
import { checkCompatibility, estimateCharge } from "@/lib/domain/compat";
import { availableStartTimes, slotProblem, type SlotPolicy } from "@/lib/domain/availability";
import { refundForCancellation } from "@/lib/domain/cancellation";
import { canTransition } from "@/lib/domain/booking-state";
import { zonedToUtc, zonedParts } from "@/lib/domain/time";

describe("pricing", () => {
  it("matches the spec example: ₹300 booking → ₹255 host, ₹45 commission", () => {
    const q = quotePrice({ pricePerHourPaise: 15000, bookingFeePaise: 0, durationMinutes: 120, commissionBps: 1500 });
    expect(q).toMatchObject({ amountPaise: 30000, commissionPaise: 4500, hostSharePaise: 25500 });
  });
  it("includes booking fees, prorates half hours and always balances", () => {
    const q = quotePrice({ pricePerHourPaise: 12345, bookingFeePaise: 2000, durationMinutes: 90, commissionBps: 1500 });
    expect(q.chargingPaise).toBe(Math.round((12345 * 90) / 60));
    expect(q.commissionPaise + q.hostSharePaise).toBe(q.amountPaise);
  });
  it("rejects nonsense input", () => {
    expect(() => quotePrice({ pricePerHourPaise: 100, bookingFeePaise: 0, durationMinutes: 0, commissionBps: 1500 })).toThrow();
    expect(() => quotePrice({ pricePerHourPaise: 100, bookingFeePaise: 0, durationMinutes: 60, commissionBps: 9000 })).toThrow();
  });
  it("net contribution is commission minus tax and gateway fees, not commission", () => {
    const c = estimateContribution({ commissionPaise: 4500, taxOnCommissionBps: 1800, processingFeeBps: 200, amountPaise: 30000 });
    expect(c).toEqual({ taxPaise: 810, processingFeePaise: 600, netContributionPaise: 3090 });
  });
});

describe("compatibility", () => {
  const nexon = { connectors: ["type2_ac", "ccs2"], batteryKwh: 45, maxAcKw: 7.2 };
  it("blocks connectors the vehicle does not list", () => {
    expect(checkCompatibility(nexon, { connectorType: "bharat_ac001", current: "AC", ratedPowerKw: 3.3 }).compatible).toBe(false);
  });
  it("caps AC power at the onboard charger limit", () => {
    const c = checkCompatibility(nexon, { connectorType: "type2_ac", current: "AC", ratedPowerKw: 22 });
    expect(c.effectiveKw).toBe(7.2);
    expect(c.reasons[0]).toMatch(/7.2 kW/);
  });
  it("gives no time estimate for DC or unknown vehicle limits", () => {
    expect(checkCompatibility(nexon, { connectorType: "ccs2", current: "DC", ratedPowerKw: 30 }).effectiveKw).toBeNull();
    expect(checkCompatibility({ ...nexon, maxAcKw: null }, { connectorType: "type2_ac", current: "AC", ratedPowerKw: 7.4 }).effectiveKw).toBeNull();
    expect(estimateCharge(null, 60, 45)).toBeNull();
  });
  it("estimates energy with efficiency and battery headroom", () => {
    expect(estimateCharge(7.2, 60, 45)).toMatchObject({ energyKwh: 6.5, percentAdded: 14 });
    expect(estimateCharge(7.2, 600, 17.3)!.energyKwh).toBeCloseTo(13.8, 1); // capped at 80% of battery
  });
});

describe("availability", () => {
  const tz = "Asia/Kolkata";
  const policy: SlotPolicy = { timeZone: tz, minDurationMinutes: 60, maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60 };
  const rules = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "08:00", end_time: "20:00" }));
  const date = "2030-01-15";
  const at = (t: string) => zonedToUtc(date, t, tz);
  const now = new Date("2030-01-01T00:00:00Z");
  const slot = (a: string, b: string) => ({ start: at(a), end: at(b) });

  it("converts IST wall time to UTC", () => {
    expect(at("10:00").toISOString()).toBe("2030-01-15T04:30:00.000Z");
    expect(zonedParts(at("10:00"), tz).minutes).toBe(600);
  });
  it("accepts a slot inside charging hours", () => {
    expect(slotProblem(slot("10:00", "11:00"), policy, rules, [], [], now)).toBeNull();
  });
  it("rejects out-of-hours, too short, too long and non-30-minute slots", () => {
    expect(slotProblem(slot("19:30", "20:30"), policy, rules, [], [], now)).toMatch(/charging hours/);
    expect(slotProblem(slot("10:00", "10:30"), policy, rules, [], [], now)).toMatch(/minimum/);
    expect(slotProblem(slot("08:00", "13:00"), policy, rules, [], [], now)).toMatch(/maximum/);
    expect(slotProblem({ start: at("10:00"), end: new Date(at("10:00").getTime() + 75 * 60000) }, policy, rules, [], [], now)).toMatch(/30-minute/);
  });
  it("enforces advance notice", () => {
    expect(slotProblem(slot("10:00", "11:00"), policy, rules, [], [], new Date(at("09:30").getTime()))).toMatch(/notice/);
  });
  it("respects buffers around existing bookings and blocked time", () => {
    const busy = [{ start: at("11:00"), end: at("12:15") }]; // 11–12 + 15 min buffer
    expect(slotProblem(slot("10:00", "11:00"), policy, rules, [], busy, now)).toMatch(/overlaps/); // own buffer runs into 11:00
    expect(slotProblem(slot("12:00", "13:00"), policy, rules, [], busy, now)).toMatch(/overlaps/);
    expect(slotProblem(slot("12:30", "13:30"), policy, rules, [], busy, now)).toBeNull();
    expect(slotProblem(slot("14:00", "15:00"), policy, rules, [slot("14:30", "16:00")], [], now)).toMatch(/blocked/);
  });
  it("lists only free start times", () => {
    const busy = [{ start: at("10:00"), end: at("11:15") }];
    const times = availableStartTimes(date, 60, policy, rules, [], busy, now);
    expect(times[0]).toBe("08:00");
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:30");
    expect(times.at(-1)).toBe("19:00");
  });
});

describe("cancellation policy", () => {
  const start = new Date("2030-01-15T10:00:00Z");
  const before = (h: number) => new Date(start.getTime() - h * 3_600_000);
  it("moderate: 100% at 24h+, 50% at 2–24h, 0 within 2h", () => {
    expect(refundForCancellation("moderate", 30000, start, before(30), "driver").refundPaise).toBe(30000);
    expect(refundForCancellation("moderate", 30000, start, before(5), "driver").refundPaise).toBe(15000);
    expect(refundForCancellation("moderate", 30000, start, before(1), "driver").refundPaise).toBe(0);
  });
  it("flexible and strict", () => {
    expect(refundForCancellation("flexible", 30000, start, before(3), "driver").percent).toBe(100);
    expect(refundForCancellation("flexible", 30000, start, before(1), "driver").percent).toBe(50);
    expect(refundForCancellation("strict", 30000, start, before(48), "driver").percent).toBe(50);
    expect(refundForCancellation("strict", 30000, start, before(10), "driver").percent).toBe(0);
  });
  it("host and platform cancellations are always refunded in full", () => {
    expect(refundForCancellation("strict", 30000, start, before(0.5), "host").refundPaise).toBe(30000);
    expect(refundForCancellation("strict", 30000, start, before(0.5), "admin").refundPaise).toBe(30000);
  });
});

describe("booking state machine", () => {
  it("only allows documented transitions", () => {
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("requested", "confirmed")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("disputed", "refunded")).toBe(true);
  });
});
