import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import type { Actor } from "@/lib/services/common";
import { createDemoProvider } from "@/lib/payments/demo";
import { approveListing, moderateListing, reviewVerification, submitVerification } from "@/lib/services/verification";
import { createListing, setListingPaused, submitListingForReview, updateListing, upsertHostProfile } from "@/lib/services/listings";
import { resolveDispute } from "@/lib/services/bookings";
import { restrictUser, setCommission } from "@/lib/services/admin";
import { createPayout } from "@/lib/services/finance";
import { authenticate, createSession, registerUser, requestPasswordReset, resetPassword, revokeSession, sessionUser } from "@/lib/services/auth-local";
import { loadActor } from "@/lib/services/common";
import type { ListingInput } from "@/lib/validation";
import { actorByEmail, expectAppError, listingByTitle, seededDb } from "./helpers";

const provider = createDemoProvider("demo-payment-secret", "demo-webhook-secret");
let db: Db;
let driver: Actor, driver2: Actor, host: Actor, hotel: Actor, admin: Actor, newhost: Actor;

const LISTING: ListingInput = {
  title: "Test wallbox in Mylapore", description: "", propertyType: "homeowner", connectorType: "type2_ac", chargerMake: "Delta",
  chargerModel: "AC Mini", ratedPowerKw: 7.4, addressLine: "12 Test Street, Mylapore", locality: "Mylapore", city: "Chennai",
  pincode: "600004", lat: 13.034, lng: 80.26, accessType: "private_driveway", parkingDetails: "Driveway", accessInstructions: "Ring the bell please",
  restrictions: "", amenities: [], supportedVehicleNotes: "", pricePerHour: 100, bookingFee: 0, minDurationMinutes: 60,
  maxDurationMinutes: 240, bufferMinutes: 15, advanceNoticeMinutes: 60, cancellationPolicy: "moderate", instantBook: true,
  availability: [{ weekday: 1, start: "08:00", end: "20:00" }],
};

beforeAll(async () => {
  db = await seededDb();
  [driver, driver2, host, hotel, admin, newhost] = await Promise.all(
    ["driver", "driver2", "host", "hotel", "admin", "newhost"].map((u) => actorByEmail(db, `${u}@chargeshare.demo`)),
  );
});
afterAll(() => db.close());

describe("admin-only actions are enforced server-side", () => {
  it("rejects drivers and hosts for every admin operation", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.charger_verifications where host_id = $1 limit 1", [newhost.userId]);
    const pending = await listingByTitle(db, "Porur");
    const { rows: disputed } = await db.query<{ id: string }>("select id from public.bookings where status = 'disputed' limit 1");
    for (const who of [driver, host, newhost]) {
      await expectAppError(reviewVerification(db, who, rows[0].id, "verified", ""), "forbidden");
      await expectAppError(approveListing(db, who, pending.id), "forbidden");
      await expectAppError(moderateListing(db, who, pending.id, "suspend", "because"), "forbidden");
      await expectAppError(setCommission(db, who, 0, "free money"), "forbidden");
      await expectAppError(restrictUser(db, who, driver2.userId, true, "nope nope"), "forbidden");
      await expectAppError(createPayout(db, who, host.userId, "x"), "forbidden");
      await expectAppError(resolveDispute(db, who, provider, disputed[0].id, 100, "resolved"), "forbidden");
    }
    await expectAppError(reviewVerification(db, null, rows[0].id, "verified", ""), "unauthenticated");
  });

  it("an admin cannot approve their own host verification", async () => {
    await upsertHostProfile(db, admin, { hostType: "homeowner", displayName: "Admin host", bio: "", contactPhone: "+91 90000 11111" });
    const me = (await loadActor(db, admin.userId))!;
    const id = await submitVerification(db, me, { checkType: "identity", details: {}, evidencePaths: ["demo/sample-document.svg"] });
    await expectAppError(reviewVerification(db, me, id, "verified", ""), "forbidden");
  });
});

describe("listing verification restrictions", () => {
  it("a new listing starts as a draft and cannot be submitted until every check has evidence", async () => {
    const id = await createListing(db, hotel, LISTING);
    const { rows } = await db.query<{ status: string }>("select status from public.charger_listings where id = $1", [id]);
    expect(rows[0].status).toBe("draft");
    await expectAppError(submitListingForReview(db, hotel, id), "invalid");
  });

  it("refuses household sockets and over-rated power", async () => {
    await expectAppError(createListing(db, hotel, { ...LISTING, connectorType: "domestic_socket", ratedPowerKw: 2 }), "invalid");
    await expectAppError(createListing(db, hotel, { ...LISTING, ratedPowerKw: 50 }), "invalid");
  });

  it("drivers without a host profile cannot list", async () => {
    await expectAppError(createListing(db, driver, LISTING), "forbidden");
  });

  it("the database refuses to activate a listing whose checks are not all verified", async () => {
    const pending = await listingByTitle(db, "Porur");
    await expect(db.query("update public.charger_listings set status = 'active' where id = $1", [pending.id])).rejects.toThrow(/verification checks/);
    await expectAppError(approveListing(db, admin, pending.id), "invalid");
  });

  it("hosts cannot edit someone else's listing (IDOR) and edits to charger specs force re-review", async () => {
    const adyar = await listingByTitle(db, "Adyar bridge");
    await expectAppError(updateListing(db, hotel, adyar.id, LISTING), "not_found");
    await expectAppError(setListingPaused(db, hotel, adyar.id, true), "not_found");
    const r = await updateListing(db, host, adyar.id, { ...LISTING, title: "Adyar bridge charger (updated)" });
    expect(r.specChanged).toBe(true);
    const { rows } = await db.query<{ status: string }>("select status from public.charger_listings where id = $1", [adyar.id]);
    expect(rows[0].status).toBe("pending_review");
  });

  it("pausing and resuming works only for approved listings", async () => {
    const anna = await listingByTitle(db, "Anna Nagar");
    await setListingPaused(db, host, anna.id, true);
    await setListingPaused(db, host, anna.id, false);
    await expectAppError(setListingPaused(db, host, anna.id, false), "invalid");
  });
});

describe("row level security (end-user JWT)", () => {
  const asUser = <T>(a: Actor | null, sql: string, params: unknown[] = []) =>
    db.asUser(a?.userId ?? null, (q) => q.query<T>(sql, params)).then((r) => r.rows);

  it("users only see their own profile, roles and vehicles", async () => {
    expect(await asUser(driver, "select id from public.profiles")).toEqual([{ id: driver.userId }]);
    expect((await asUser<{ user_id: string }>(driver, "select user_id from public.user_roles")).every((r) => r.user_id === driver.userId)).toBe(true);
    const v = await asUser<{ owner_id: string }>(driver, "select owner_id from public.vehicles");
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((r) => r.owner_id === driver.userId)).toBe(true);
    expect(await asUser(null, "select id from public.profiles")).toEqual([]);
  });

  it("drivers see only their bookings and payments; hosts only bookings on their listings", async () => {
    const driverBookings = await asUser<{ driver_id: string }>(driver, "select driver_id from public.bookings");
    expect(driverBookings.length).toBeGreaterThan(0);
    expect(driverBookings.every((b) => b.driver_id === driver.userId)).toBe(true);
    const payments = await asUser<{ driver_id: string }>(driver, "select b.driver_id from public.payments p join public.bookings b on b.id = p.booking_id");
    expect(payments.every((p) => p.driver_id === driver.userId)).toBe(true);
    const hostBookings = await asUser<{ host_id: string }>(host, "select host_id from public.bookings");
    expect(hostBookings.every((b) => b.host_id === host.userId)).toBe(true);
    expect(await asUser(host, "select id from public.payments")).toEqual([]); // hosts never see driver payment records
  });

  it("hosts see only their own host-share and payout ledger lines", async () => {
    const rows = await asUser<{ host_id: string; entry_type: string }>(host, "select host_id, entry_type from public.ledger_entries");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.host_id === host.userId && ["host_share", "payout"].includes(r.entry_type))).toBe(true);
    expect(await asUser(driver, "select id from public.ledger_entries")).toEqual([]);
  });

  it("exact addresses are hidden from the public; approximate listings are visible", async () => {
    expect(await asUser(driver, "select id from public.charger_listings")).toEqual([]);
    const pub = await asUser<Record<string, unknown>>(null, "select * from public.public_listings limit 1");
    expect(pub[0]).toBeDefined();
    expect(pub[0]).not.toHaveProperty("address_line");
    expect(pub[0]).not.toHaveProperty("access_instructions");
    expect(pub[0]).not.toHaveProperty("lat");
    await expect(asUser(null, "select address_line from public.charger_listings")).rejects.toThrow(/permission denied/);
  });

  it("end users cannot forge bookings, payments, ledger entries or roles", async () => {
    const { rows: l } = await db.query<{ id: string; host_id: string }>("select id, host_id from public.charger_listings limit 1");
    await expect(
      asUser(driver, "insert into public.bookings (code, listing_id, driver_id, host_id, status, start_at, end_at, block_end_at, duration_minutes, price_per_hour_paise, amount_paise, commission_bps, commission_paise, host_share_paise, cancellation_policy) values ('X', $1, $2, $3, 'confirmed', now(), now() + interval '1 hour', now() + interval '1 hour', 60, 1, 1, 0, 0, 1, 'moderate')", [l[0].id, driver.userId, l[0].host_id]),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(driver, "update public.payments set status = 'refunded'")).rejects.toThrow(/permission denied/);
    await expect(asUser(host, "insert into public.ledger_entries (entry_type, amount_paise, host_id) values ('host_share', 99999, $1)", [host.userId])).rejects.toThrow(/permission denied/);
    await expect(asUser(driver, "insert into public.user_roles (user_id, role) values ($1, 'admin')", [driver.userId])).rejects.toThrow(/permission denied/);
  });

  it("hosts cannot approve their own verification or activate a listing directly", async () => {
    await expect(asUser(newhost, "update public.charger_verifications set status = 'verified' where host_id = $1", [newhost.userId])).rejects.toThrow(/cannot approve/);
    const porur = await listingByTitle(db, "Porur");
    await expect(asUser(newhost, "update public.charger_listings set status = 'active' where id = $1", [porur.id])).rejects.toThrow();
    await expect(asUser(newhost, "update public.charger_listings set approved_at = now() where id = $1", [porur.id])).rejects.toThrow(/not allowed/);
  });

  it("users cannot lift their own restriction", async () => {
    await restrictUser(db, admin, driver2.userId, true, "Repeated no-shows");
    await expect(asUser(driver2, "update public.profiles set is_restricted = false, restricted_reason = null where id = $1", [driver2.userId])).rejects.toThrow(/not allowed/);
    await restrictUser(db, admin, driver2.userId, false, "");
    const ok = await asUser(driver, "update public.profiles set full_name = 'Karthik R' where id = $1 returning id", [driver.userId]);
    expect(ok).toHaveLength(1);
  });

  it("audit logs are admin-only and append-only; the ledger is append-only", async () => {
    expect(await asUser(driver, "select id from public.admin_audit_logs")).toEqual([]);
    expect((await asUser(admin, "select id from public.admin_audit_logs")).length).toBeGreaterThan(0);
    await expect(db.query("update public.admin_audit_logs set reason = 'edited'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from public.ledger_entries")).rejects.toThrow(/append-only/);
  });
});

describe("local authentication", () => {
  it("registers, authenticates and revokes sessions", async () => {
    const id = await registerUser(db, { email: "New.User@Example.com", password: "Passw0rd!", fullName: "New User" });
    expect(await authenticate(db, "new.user@example.com", "Passw0rd!")).toBe(id);
    expect(await authenticate(db, "new.user@example.com", "wrong")).toBeNull();
    expect(await authenticate(db, "nobody@example.com", "Passw0rd!")).toBeNull();
    const actor = await loadActor(db, id);
    expect(actor?.roles).toEqual(["driver"]); // never host or admin by default
    const s = await createSession(db, id);
    expect(await sessionUser(db, s.id)).toBe(id);
    await revokeSession(db, s.id);
    expect(await sessionUser(db, s.id)).toBeNull();
    await expectAppError(registerUser(db, { email: "new.user@example.com", password: "Passw0rd!", fullName: "Dup" }), "conflict");
  });

  it("password reset tokens are single-use and revoke existing sessions", async () => {
    const id = await registerUser(db, { email: "reset@example.com", password: "Passw0rd!", fullName: "Reset" });
    const s = await createSession(db, id);
    expect(await requestPasswordReset(db, "unknown@example.com", "http://x")).toBeNull();
    const token = (await requestPasswordReset(db, "reset@example.com", "http://x"))!;
    await resetPassword(db, token, "N3wPassword");
    expect(await authenticate(db, "reset@example.com", "N3wPassword")).toBe(id);
    expect(await sessionUser(db, s.id)).toBeNull();
    await expectAppError(resetPassword(db, token, "Another1"), "invalid");
  });
});
