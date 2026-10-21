import path from "node:path";
import { expect, test } from "@playwright/test";
import { PASSWORD, signIn } from "./helpers";

const EVIDENCE = path.join(__dirname, "fixtures", "evidence.png");

test("new host lists a charger, an admin verifies it, and it goes live", async ({ page, browser }) => {
  const email = `e2e.host.${Date.now()}@example.com`;
  const title = `E2E Mylapore wallbox ${Date.now() % 100000}`;

  // Register as a host
  await page.goto("/signup?intent=host");
  await page.getByLabel("Full name").fill("Priya E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/host/onboarding");

  // Host profile, identity evidence and safety checklist
  await page.getByLabel("Contact phone (private)").fill("+91 90000 22222");
  await page.getByRole("button", { name: "Create host profile" }).click();
  await expect(page.getByText("Host profile saved.")).toBeVisible();
  await page.getByLabel("Document type").fill("Passport");
  await page.getByLabel("Name as on document").fill("Priya E2E");
  await page.locator('input[name="evidence"]').setInputFiles(EVIDENCE);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review/).first()).toBeVisible();
  for (const box of await page.locator('#checklist input[type="checkbox"]').all()) await box.check();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.getByText("Checklist saved.")).toBeVisible();

  // Six-step listing wizard
  await page.getByRole("link", { name: "Create a listing" }).click();
  await page.getByLabel("Listing title").fill(title);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Charger make").fill("Delta");
  await page.getByLabel("Model").fill("AC Mini Plus 7.4 kW");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Locality").selectOption("Mylapore");
  await page.getByLabel("PIN code").fill("600004");
  await page.getByLabel("Full address").fill("12 Test Street, Mylapore");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Parking details").fill("Covered driveway bay");
  await page.getByLabel("Access instructions").fill("Ring the bell at the green gate.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click(); // pricing defaults
  await page.getByRole("button", { name: "Save draft listing" }).click();
  await page.waitForURL(/\/host\/listings\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // The draft cannot be submitted until every check has evidence
  const evidenceForms = page.locator("form").filter({ has: page.locator('input[name="evidence"]') });
  await expect(evidenceForms).toHaveCount(4);
  while ((await evidenceForms.count()) > 0) {
    const before = await evidenceForms.count();
    const form = evidenceForms.first();
    await form.locator('input[name="evidence"]').setInputFiles(EVIDENCE);
    await form.getByRole("button", { name: "Submit for review" }).click();
    await expect(evidenceForms).toHaveCount(before - 1);
  }
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Sent for review/)).toBeVisible();
  await expect(page.getByText("In review", { exact: true }).first()).toBeVisible();

  // Not public yet
  await page.goto("/chargers?q=Mylapore");
  await expect(page.getByText(title)).toHaveCount(0);

  // Admin review in a separate session
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, "admin@chargeshare.demo", "/admin/verifications");
  const card = admin.getByRole("heading", { name: title }).locator('xpath=ancestor::div[contains(@class,"p-5")][1]');
  await expect(card).toBeVisible();
  const pending = card.locator("form").filter({ has: admin.locator('select[name="decision"] option[value="verified"]') });
  await expect(pending).toHaveCount(5);
  while ((await pending.count()) > 0) {
    const before = await pending.count();
    await pending.first().getByRole("button", { name: "Record decision" }).click();
    await expect(pending).toHaveCount(before - 1);
  }
  await card.getByRole("button", { name: "Approve listing" }).click();
  await expect(admin.getByText("Listing approved and live.")).toBeVisible();
  await adminCtx.close();

  // Now public, and the host was notified
  await page.goto("/chargers?q=Mylapore");
  await expect(page.getByText(title)).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText("Your charger is live")).toBeVisible();
});

test("host accepts a booking request", async ({ page }) => {
  await signIn(page, "host@chargeshare.demo", "/host");
  await page.getByRole("link", { name: /CS-.*Kotturpuram/ }).click();
  await page.getByRole("button", { name: "Accept request" }).click();
  await expect(page.getByText(/Accepted. The driver has been asked to pay./)).toBeVisible();
  await expect(page.getByText("Awaiting payment").first()).toBeVisible();
});

test("admin resolves the seeded dispute with a partial refund", async ({ page }) => {
  await signIn(page, "admin@chargeshare.demo", "/admin/bookings");
  await page.getByLabel(/Refund to driver/).first().fill("100");
  await page.getByLabel(/Resolution note/).first().fill("Charger fault confirmed; partial refund agreed.");
  await page.getByRole("button", { name: "Resolve dispute" }).click();
  await expect(page.getByText("Dispute resolved.")).toBeVisible();
  await expect(page.getByText("No open disputes.")).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByText("dispute.resolve").first()).toBeVisible();
});
