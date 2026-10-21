import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/core";
import { toCsv } from "@/lib/csv";
import { adminExport, hostStatement, parseRange } from "@/lib/services/exports";
import { actorByEmail, expectAppError, seededDb } from "./helpers";

describe("csv writer", () => {
  it("quotes, escapes and neutralises spreadsheet formulas in text but keeps numbers numeric", () => {
    const out = toCsv(["a", "b", "c", "d"], [["=HYPERLINK(\"x\")", 'He said "hi", ok', -12.5, "@SUM(A1)"]]);
    expect(out).toBe('a,b,c,d\r\n"\'=HYPERLINK(""x"")","He said ""hi"", ok",-12.5,\'@SUM(A1)\r\n');
  });
  it("rejects inverted date ranges", async () => {
    expect(parseRange("2026-01-01", "2026-02-01")).toEqual({ from: "2026-01-01", to: "2026-02-01" });
    expect(parseRange("nonsense", null)).toEqual({ from: null, to: null });
    expect(() => parseRange("2026-03-01", "2026-02-01")).toThrow();
  });
});

describe("finance exports", () => {
  let db: Db;
  beforeAll(async () => {
    db = await seededDb();
  });
  afterAll(() => db.close());

  it("ledger export reconciles with the ledger table and is audited", async () => {
    const admin = await actorByEmail(db, "admin@chargeshare.demo");
    const csv = await adminExport(db, admin, "ledger", { from: null, to: null });
    const lines = csv.trim().split("\r\n");
    const { rows } = await db.query<{ n: number; total: number }>("select count(*)::int as n, sum(amount_paise)::int as total from public.ledger_entries");
    expect(lines.length - 1).toBe(rows[0].n);
    const amountCol = lines[0].split(",").indexOf("amount_inr");
    const sum = lines.slice(1).reduce((s, l) => s + Math.round(Number(l.split(",")[amountCol]) * 100), 0);
    expect(sum).toBe(rows[0].total);
    const { rows: a } = await db.query("select 1 from public.admin_audit_logs where action = 'export.ledger'");
    expect(a.length).toBe(1);
    for (const kind of ["payouts", "bookings", "refunds"] as const) {
      expect((await adminExport(db, admin, kind, { from: null, to: null })).split("\r\n").length).toBeGreaterThan(2);
    }
  });

  it("date ranges filter by IST calendar day", async () => {
    const admin = await actorByEmail(db, "admin@chargeshare.demo");
    const csv = await adminExport(db, admin, "bookings", { from: "2000-01-01", to: "2000-01-02" });
    expect(csv.trim().split("\r\n")).toHaveLength(1); // header only
  });

  it("only admins can export platform finance; hosts get only their own lines", async () => {
    const host = await actorByEmail(db, "host@chargeshare.demo");
    const driver = await actorByEmail(db, "driver@chargeshare.demo");
    await expectAppError(adminExport(db, host, "ledger", { from: null, to: null }), "forbidden");
    await expectAppError(hostStatement(db, driver, { from: null, to: null }), "forbidden");
    const csv = await hostStatement(db, host, { from: null, to: null });
    const lines = csv.trim().split("\r\n").slice(1);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.ledger_entries where host_id = $1 and entry_type in ('host_share', 'payout')",
      [host.userId],
    );
    expect(lines).toHaveLength(rows[0].n);
    expect(csv).not.toMatch(/Commission on|platform_commission/);
  });
});
