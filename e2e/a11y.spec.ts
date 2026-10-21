import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Fails on serious or critical WCAG 2.1 A/AA violations. */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Leaflet's third-party map tiles/controls are excluded; our own map labelling is checked separately.
    .exclude(".leaflet-container")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${path}: [${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(serious, report.join("\n")).toEqual([]);
}

test("public pages have no serious accessibility violations", async ({ page }) => {
  for (const p of ["/", "/chargers", "/how-it-works", "/safety", "/login", "/signup", "/legal/cancellation"]) await audit(page, p);
  await page.goto("/chargers");
  await page.getByRole("link", { name: /Adyar bridge/ }).first().click();
  await audit(page, page.url().replace(/^https?:\/\/[^/]+/, ""));
});

test("driver pages have no serious accessibility violations", async ({ page }) => {
  await signIn(page, "driver@chargeshare.demo");
  for (const p of ["/dashboard", "/account", "/support", "/notifications"]) await audit(page, p);
});

test("host and admin pages have no serious accessibility violations", async ({ page, browser }) => {
  await signIn(page, "host@chargeshare.demo", "/host");
  for (const p of ["/host", "/host/bookings", "/host/earnings", "/host/onboarding", "/host/listings/new"]) await audit(page, p);
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin, "admin@chargeshare.demo", "/admin");
  for (const p of ["/admin", "/admin/verifications", "/admin/bookings", "/admin/payouts", "/admin/users", "/admin/support"]) await audit(admin, p);
  await ctx.close();
});
