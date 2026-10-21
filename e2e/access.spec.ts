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

test("verification evidence is not publicly downloadable and webhooks reject forged signatures", async ({ request }) => {
  expect((await request.get("/api/files/evidence/anything/file.pdf")).status()).toBe(404);
  const hook = await request.post("/api/webhooks/demo", { data: { event: "payment.captured" }, headers: { "x-demo-signature": "forged" } });
  expect(hook.status()).toBe(400);
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ status: "ok", demoMode: true, payments: "demo" });
});
