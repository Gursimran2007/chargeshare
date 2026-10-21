/** Shared helpers for the staging scripts. Never prints secret values. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} is not set in .env.staging.local`);
    process.exit(1);
  }
  return v;
}

export function maskUrl(url: string) {
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username.slice(0, 12)}…` : "";
    const params = [...u.searchParams.keys()].filter((k) => k !== "password").join(",");
    return `${u.protocol}//${user}@${u.host}${u.pathname}${params ? ` [${params}]` : ""}`;
  } catch {
    return "(unparseable URL)";
  }
}

export const mask = (v: string) => (v.length <= 8 ? "••••" : `${v.slice(0, 4)}…${v.slice(-2)}`);

export function tlsMode(url: string) {
  const p = new URL(url).searchParams;
  if (p.get("sslmode") === "verify-full" && p.get("sslrootcert")) return "verified (verify-full + CA)";
  if (p.get("sslmode") === "require" && p.get("uselibpqcompat") === "true") return "encrypted, NOT verified";
  if (p.get("sslmode")) return `sslmode=${p.get("sslmode")}`;
  return "none specified";
}

/** Staging must never point at live payment keys or a non-local app URL. */
export function assertStagingSafe() {
  const key = process.env.RAZORPAY_KEY_ID ?? "";
  if (key.startsWith("rzp_live_")) {
    console.error("✗ RAZORPAY_KEY_ID is a LIVE key. Staging only accepts test keys (rzp_test_…).");
    process.exit(1);
  }
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(app)) {
    console.error("✗ NEXT_PUBLIC_APP_URL must be a localhost URL for local staging.");
    process.exit(1);
  }
}
