import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("signed-out visitors are sent to sign in for private pages", async ({ page }) => {
  for (const p of ["/dashboard", "/host", "/admin", "/account"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("drivers cannot reach the admin console", async ({ page }) => {
  await signIn(page, "driver@chargeshare.demo");
  const res = await page.goto("/admin/verifications");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
});

test("HTML responses carry a nonce-based CSP that Next.js applies to its scripts", async ({ page }) => {
  const res = await page.goto("/");
  const csp = res!.headers()["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  const nonce = /'nonce-([^']+)'/.exec(csp)![1];
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => n === nonce)).toBe(true);
  // A fresh nonce per request
  const again = (await page.goto("/"))!.headers()["content-security-policy"];
  expect(again).not.toBe(csp);
});

test("finance exports: admins download CSVs, others get 404", async ({ page, request }) => {
  expect((await request.get("/api/admin/exports/ledger")).status()).toBe(404);
  await signIn(page, "admin@chargeshare.demo", "/admin/payouts");
  await expect(page.getByRole("heading", { name: "Finance exports" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^chargeshare-ledger-.*\.csv$/);
  const res = await page.request.get("/api/admin/exports/bookings?from=2000-01-01&to=2000-01-02");
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect((await res.text()).trim().split("\r\n")).toHaveLength(1); // header only for an empty range
});

test("hosts download their own earnings statement", async ({ page }) => {
  await signIn(page, "host@chargeshare.demo", "/host/earnings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download statement/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^chargeshare-earnings-.*\.csv$/);
  expect((await page.request.get("/api/admin/exports/ledger")).status()).toBe(404);
});

test("verification evidence is not publicly downloadable and webhooks reject forged signatures", async ({ request }) => {
  expect((await request.get("/api/files/evidence/anything/file.pdf")).status()).toBe(404);
  const hook = await request.post("/api/webhooks/demo", { data: { event: "payment.captured" }, headers: { "x-demo-signature": "forged" } });
  expect(hook.status()).toBe(400);
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ status: "ok", demoMode: true, payments: "demo" });
});
