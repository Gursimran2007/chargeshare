import "server-only";

/**
 * Central runtime configuration. Demo mode is on whenever no real database is
 * configured, and can never be combined with live payments.
 */
function bool(v: string | undefined, fallback: boolean) {
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

const databaseUrl = process.env.DATABASE_URL ?? "";

export const config = {
  databaseUrl,
  demoMode: bool(process.env.DEMO_MODE, databaseUrl === ""),
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  sessionSecret:
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-only-session-secret-change-me"),
  pgliteDataDir: process.env.PGLITE_DATA_DIR ?? ".data/pglite",
  uploadDir: process.env.UPLOAD_DIR ?? ".data/uploads",
  authProvider: (process.env.AUTH_PROVIDER ?? (databaseUrl ? "supabase" : "local")) as "local" | "supabase",
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "chargeshare",
  },
  payments: {
    provider: (process.env.PAYMENT_PROVIDER ?? "demo") as "demo" | "razorpay",
    demoSecret: process.env.DEMO_PAYMENT_SECRET ?? "demo-payment-secret",
    demoWebhookSecret: process.env.DEMO_WEBHOOK_SECRET ?? "demo-webhook-secret",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  },
};

export function assertConfig() {
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be set (at least 16 characters).");
  }
  if (config.payments.provider === "razorpay" && config.demoMode) {
    throw new Error("Live payments cannot run in demo mode. Set DATABASE_URL and DEMO_MODE=false.");
  }
}
