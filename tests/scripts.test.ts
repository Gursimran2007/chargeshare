import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Runs each operational script the way npm does (via tsx), without credentials, and
// checks it fails with its own guidance message rather than a module/transform error.
const root = path.resolve(__dirname, "..");
function run(script: string, env: Record<string, string> = {}) {
  const r = spawnSync("npx", ["tsx", script], {
    cwd: root,
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("operational scripts start correctly", () => {
  it.each([
    ["scripts/migrate.ts", {}, /DATABASE_URL is not set/],
    ["scripts/grant-admin.ts", {}, /Usage: DATABASE_URL=/],
    ["scripts/staging-check.ts", {}, /NEXT_PUBLIC_APP_URL must be a localhost URL/],
    ["scripts/staging-seed.ts", { NEXT_PUBLIC_APP_URL: "http://localhost:3260", RAZORPAY_KEY_ID: "rzp_live_x" }, /LIVE key/],
  ] as const)("%s", (script, env, expected) => {
    const r = run(script, env);
    expect(r.out).not.toMatch(/TransformError|ERR_REQUIRE_ASYNC_MODULE|SyntaxError/);
    expect(r.out).toMatch(expected);
    expect(r.code).toBe(1);
  });
});

describe("env-file wrapper", () => {
  it("explains a missing env file instead of crashing", () => {
    const r = spawnSync("node", ["scripts/with-env.mjs", ".env.does-not-exist", "true"], { cwd: root, encoding: "utf8" });
    expect(r.stderr).toMatch(/\.env\.does-not-exist not found/);
    expect(r.status).toBe(1);
  });
  it("passes the file's variables to the command", () => {
    const f = path.join(root, ".data", "with-env-test.env");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, "CS_WITH_ENV_TEST=hello\n");
    const r = spawnSync("node", ["scripts/with-env.mjs", f, "node", "-e", "console.log(process.env.CS_WITH_ENV_TEST)"], { cwd: root, encoding: "utf8" });
    expect(r.stdout.trim()).toBe("hello");
  });
});
