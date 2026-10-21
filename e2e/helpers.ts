import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Demo@1234";

export async function signIn(page: Page, email: string, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** IST date `days` from now, as YYYY-MM-DD. */
export function istDate(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + days * 86400_000));
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/**
 * Records Content-Security-Policy violations on every page the test opens.
 * Call once at the start of a test, then `await expectNoCspViolations()` at the end.
 */
export function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  return async () => expect(violations, violations.join("\n")).toEqual([]);
}
