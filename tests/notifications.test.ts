import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import { recipientAllowed, type EmailTransport, type OutgoingEmail } from "@/lib/email/types";
import { deliverPendingEmails } from "@/lib/services/maintenance";
import { notify } from "@/lib/services/common";
import { setReviewHidden } from "@/lib/services/admin";
import { getPublicListing } from "@/lib/services/listings";
import { actorByEmail, expectAppError, seededDb } from "./helpers";

describe("recipient allow-list", () => {
  it("allows exact addresses and @domains only", () => {
    expect(recipientAllowed("Ops@ChargeShare.in", ["@chargeshare.in"], false)).toBe(true);
    expect(recipientAllowed("me@example.com", ["me@example.com"], false)).toBe(true);
    expect(recipientAllowed("someone@gmail.com", ["@chargeshare.in"], false)).toBe(false);
    expect(recipientAllowed("someone@gmail.com", [], false)).toBe(false);
    expect(recipientAllowed("someone@gmail.com", [], true)).toBe(true);
  });
});

describe("email delivery worker", () => {
  let db: Db;
  const sent: OutgoingEmail[] = [];
  let failNext = 0;
  const fake: EmailTransport = {
    name: "resend",
    async send(m) {
      if (failNext > 0) {
        failNext--;
        throw new Error("provider down");
      }
      sent.push(m);
    },
  };
  const status = async () =>
    Object.fromEntries(
      (await db.query<{ s: string; n: number }>("select delivery_status as s, count(*)::int as n from public.notifications where channel = 'email' group by 1")).rows.map((r) => [r.s, r.n]),
    );

  beforeAll(async () => {
    db = await seededDb();
  });
  afterAll(() => db.close());

  it("queues email inside the business transaction and never sends on rollback", async () => {
    const driver = await actorByEmail(db, "driver@chargeshare.demo");
    await db.tx(async (q) => notify(q, driver.userId, { type: "t", title: "Committed", email: true }));
    await db
      .tx(async (q) => {
        await notify(q, driver.userId, { type: "t", title: "Rolled back", email: true });
        throw new Error("abort");
      })
      .catch(() => {});
    const { rows } = await db.query<{ title: string }>("select title from public.notifications where channel = 'email' and delivery_status = 'pending'");
    expect(rows.map((r) => r.title)).toContain("Committed");
    expect(rows.map((r) => r.title)).not.toContain("Rolled back");
  });

  it("only sends to allow-listed recipients, with absolute links, exactly once", async () => {
    const pending = (await status()).pending;
    const r = await deliverPendingEmails(db, { transport: fake, allowlist: ["driver@chargeshare.demo"], allowAll: false, appUrl: "https://app.example" }, 500);
    expect(r.sent + r.blocked).toBe(pending);
    expect(sent.length).toBe(r.sent);
    expect(sent.every((m) => m.to === "driver@chargeshare.demo")).toBe(true);
    expect(sent.some((m) => m.text.includes("https://app.example/"))).toBe(true);
    const again = await deliverPendingEmails(db, { transport: fake, allowlist: ["driver@chargeshare.demo"], allowAll: false, appUrl: "x" });
    expect(again).toEqual({ sent: 0, outbox: 0, blocked: 0, failed: 0 });
  });

  it("retries provider failures and gives up after three attempts", async () => {
    const driver = await actorByEmail(db, "driver@chargeshare.demo");
    await notify(db, driver.userId, { type: "t", title: "Retry me", email: true });
    const d = { transport: fake, allowlist: ["driver@chargeshare.demo"], allowAll: false, appUrl: "x" };
    failNext = 1;
    expect((await deliverPendingEmails(db, d)).sent).toBe(0); // first attempt fails, stays pending
    expect((await deliverPendingEmails(db, d)).sent).toBe(1); // second succeeds
    await notify(db, driver.userId, { type: "t", title: "Always fails", email: true });
    failNext = 3;
    for (let i = 0; i < 3; i++) await deliverPendingEmails(db, d);
    const { rows } = await db.query<{ delivery_status: string; delivery_attempts: number }>(
      "select delivery_status, delivery_attempts from public.notifications where title = 'Always fails' and channel = 'email'",
    );
    expect(rows[0]).toEqual({ delivery_status: "failed", delivery_attempts: 3 });
  });

  it("captures mail in the outbox when no provider is configured", async () => {
    const driver = await actorByEmail(db, "driver@chargeshare.demo");
    await notify(db, driver.userId, { type: "t", title: "Outbox", email: true });
    const r = await deliverPendingEmails(db, { transport: { name: "outbox", send: async () => {} }, allowlist: [], allowAll: false, appUrl: "x" });
    expect(r.outbox).toBe(1);
  });
});

describe("review moderation", () => {
  let db: Db;
  beforeAll(async () => {
    db = await seededDb();
  });
  afterAll(() => db.close());

  it("admins can hide a review, which removes it from the public rating; others cannot", async () => {
    const admin = await actorByEmail(db, "admin@chargeshare.demo");
    const host = await actorByEmail(db, "host@chargeshare.demo");
    const { rows } = await db.query<{ id: string; listing_id: string }>("select id, listing_id from public.reviews order by created_at limit 1");
    const before = await getPublicListing(db, rows[0].listing_id);
    await expectAppError(setReviewHidden(db, host, rows[0].id, true, "I dislike it"), "forbidden");
    await expectAppError(setReviewHidden(db, admin, rows[0].id, true, ""), "invalid");
    await setReviewHidden(db, admin, rows[0].id, true, "Contains a phone number");
    const after = await getPublicListing(db, rows[0].listing_id);
    expect(after!.review_count).toBe(before!.review_count - 1);
    await setReviewHidden(db, admin, rows[0].id, false, "");
    expect((await getPublicListing(db, rows[0].listing_id))!.review_count).toBe(before!.review_count);
    const { rows: a } = await db.query("select 1 from public.admin_audit_logs where action in ('review.hide', 'review.restore')");
    expect(a.length).toBe(2);
  });
});
