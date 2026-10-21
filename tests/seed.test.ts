import { describe, it, expect } from "vitest";
import { seededDb } from "./helpers";

describe("demo seed", () => {
  it("migrates and seeds a consistent dataset", async () => {
    const db = await seededDb();
    const count = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0].n;
    expect(await count("select count(*)::int as n from public.charger_listings where status = 'active'")).toBe(10);
    expect(await count("select count(*)::int as n from public.bookings where status = 'completed'")).toBe(7);
    expect(await count("select count(*)::int as n from public.bookings where status = 'disputed'")).toBe(1);
    expect(await count("select count(*)::int as n from public.bookings where status = 'requested'")).toBe(1);
    expect(await count("select count(*)::int as n from public.reviews")).toBe(7);
    // Ledger balances: gross = host share + commission, before and after refunds.
    const { rows } = await db.query<Record<string, number>>(`select
      sum(amount_paise) filter (where entry_type='booking_gross')::int as gross,
      sum(amount_paise) filter (where entry_type='host_share')::int as host,
      sum(amount_paise) filter (where entry_type='platform_commission')::int as comm,
      sum(amount_paise) filter (where entry_type='refund')::int as refund from public.ledger_entries`);
    expect(rows[0].gross - rows[0].refund).toBe(rows[0].host + rows[0].comm);
    await db.close();
  });
});
