import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build with a throwaway demo database.
 * Uses the locally installed Google Chrome (channel "chrome"), so no browser download is needed.
 *   npm run test:e2e
 */
const PORT = 3250;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome" }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome" }, testMatch: /mobile/ },
  ],
  webServer: {
    // Fresh demo database each run. Cleanup happens here, not in globalSetup, because
    // Playwright starts the web server before global setup runs.
    command: `node -e "require('fs').rmSync('.data/e2e',{recursive:true,force:true})" && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PGLITE_DATA_DIR: ".data/e2e/pglite",
      UPLOAD_DIR: ".data/e2e/uploads",
      SESSION_SECRET: "e2e-only-session-secret-0123456789",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    },
  },
});
