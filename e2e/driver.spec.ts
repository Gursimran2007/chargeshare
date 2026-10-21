import { expect, test } from "@playwright/test";
import { istDate, signIn } from "./helpers";

test("driver: search → compatible slot → demo payment → confirmation → receipt → cancel with refund", async ({ page }) => {
  await signIn(page, "driver@chargeshare.demo");
  await page.goto("/chargers?q=Besant%20Nagar");
  await expect(page.getByRole("heading", { name: "Chargers near Besant Nagar" })).toBeVisible();
  await page.getByRole("link", { name: /Besant Nagar boutique stay charger/ }).first().click();
  await expect(page.getByRole("heading", { name: "Besant Nagar boutique stay charger" })).toBeVisible();
  await expect(page.getByText("Fictional listing · checks simulated")).toBeVisible();

  await page.getByLabel("Date").fill(istDate(5));
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await expect(page.getByText("Compatible with your vehicle")).toBeVisible();
  await expect(page.getByText("Estimates only.")).toBeVisible();
  await page.getByRole("button", { name: "Reserve and pay" }).click();

  await page.waitForURL(/\/checkout\//);
  await expect(page.getByRole("heading", { name: "Confirm and pay" })).toBeVisible();
  await expect(page.getByText("₹160.00").first()).toBeVisible(); // ₹160/h × 1 h, priced on the server
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await expect(page.getByText("DEMO PAYMENT · no money will move")).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();

  await page.waitForURL(/\/bookings\/.*confirmed=1/);
  await expect(page.getByText("Booking confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Demo address, 6th Avenue/)).toBeVisible(); // exact address released only now

  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByText("Payment receipt")).toBeVisible();
  await expect(page.getByText(/Demo record: this payment was simulated/)).toBeVisible();
  await page.getByRole("link", { name: "← Back to booking" }).click();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText(/You will be refunded ₹160.00 of ₹160.00/)).toBeVisible(); // 5 days ahead, moderate policy
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Refund (processed)")).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
});

test("driver: a simulated payment failure leaves the booking unpaid and retryable", async ({ page }) => {
  await signIn(page, "driver@chargeshare.demo");
  await page.goto("/chargers?q=Guindy");
  await page.getByRole("link", { name: /Guindy business park/ }).first().click();
  await page.getByLabel("Date").fill(istDate(6));
  await page.getByRole("button", { name: "19:00", exact: true }).click();
  await page.getByRole("button", { name: "Reserve and pay" }).click();
  await page.waitForURL(/\/checkout\//);
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await page.getByRole("button", { name: "Simulate failure" }).click();
  await expect(page.getByText(/Simulated payment failure/)).toBeVisible();
  // The failed order is discarded; retrying creates a fresh one and succeeds.
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await page.waitForURL(/\/bookings\/.*confirmed=1/);
  await expect(page.getByText("Booking confirmed", { exact: true })).toBeVisible();
});
