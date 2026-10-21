import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn } from "./helpers";

test("mobile: landing, map toggle, listing and dashboard fit a phone screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your next charge is/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/chargers");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Map" }).click();
  await expect(page.getByRole("region", { name: /Map of chargers/ })).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();
  await page.getByRole("link", { name: /Adyar bridge/ }).first().click();
  await expect(page.getByRole("link", { name: "Sign in to book" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await signIn(page, "driver@chargeshare.demo");
  await expect(page.getByRole("heading", { name: /Hi Karthik/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  for (const p of ["/account", "/support", "/how-it-works"]) {
    await page.goto(p);
    await expectNoHorizontalScroll(page);
  }
});
