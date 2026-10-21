/**
 * Validates .env.staging.local without printing secrets:
 *   npm run staging:check
 * Checks database connectivity and TLS, Supabase Auth admin access and email-confirmation
 * setting, the storage bucket, and that the Razorpay keys are valid TEST keys.
 */
import { createClient } from "@supabase/supabase-js";
import { createPool } from "../src/lib/db/core";
import { assertStagingSafe, mask, maskUrl, need, tlsMode } from "./staging-lib";

async function main() {
  assertStagingSafe();
  let failures = 0;
  const ok = (m: string) => console.log(`✓ ${m}`);
  const bad = (m: string) => {
    failures++;
    console.log(`✗ ${m}`);
  };

  const dbUrl = need("DATABASE_URL");
  const sbUrl = need("NEXT_PUBLIC_SUPABASE_URL");
  const anon = need("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = need("SUPABASE_SERVICE_ROLE_KEY");
  if ((process.env.SESSION_SECRET ?? "").length < 32) bad("SESSION_SECRET should be at least 32 characters");
  else ok("SESSION_SECRET set");
  if (process.env.AUTH_PROVIDER !== "supabase") bad("AUTH_PROVIDER must be 'supabase' for staging");

  console.log(`  database: ${maskUrl(dbUrl)}  TLS: ${tlsMode(dbUrl)}`);
  try {
    const db = await createPool(dbUrl);
    const { rows } = await db.query<{ v: string; gist: boolean }>(
      "select current_setting('server_version') as v, exists (select 1 from pg_available_extensions where name = 'btree_gist') as gist",
    );
    ok(`database reachable (Postgres ${rows[0].v})`);
    if (!rows[0].gist) bad("btree_gist extension not available");
    const { rows: m } = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'internal' and table_name = 'schema_migrations'",
    );
    if (m[0].n) {
      const { rows: applied } = await db.query<{ name: string }>("select name from internal.schema_migrations order by name");
      ok(`migrations applied: ${applied.length} (${applied.map((a) => a.name.replace(".sql", "")).join(", ")})`);
    } else {
      console.log("  migrations: none yet (run npm run staging:seed)");
    }
    await db.close();
  } catch (e) {
    bad(`database connection failed: ${(e as Error).message}`);
  }

  try {
    const admin = createClient(sbUrl, service, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) bad(`Supabase Auth admin API: ${error.message}`);
    else ok(`Supabase Auth admin API reachable (service key ${mask(service)})`);
    const settings = await fetch(`${sbUrl}/auth/v1/settings`, { headers: { apikey: anon } }).then((r) => r.json());
    if (settings.mailer_autoconfirm) ok("email confirmation is OFF (required for automated sign-up tests)");
    else bad("email confirmation is ON: turn off 'Confirm email' (Authentication → Sign In / Providers → Email) for staging");
    const { data: bucket } = await admin.storage.getBucket(process.env.SUPABASE_STORAGE_BUCKET || "chargeshare");
    if (bucket) ok(`storage bucket '${bucket.name}' exists (public: ${bucket.public})`);
    else console.log("  storage bucket: not created yet (migration 0007 creates it)");
  } catch (e) {
    bad(`Supabase check failed: ${(e as Error).message}`);
  }

  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  if (!keyId || !keySecret) {
    console.log("  Razorpay: keys not set (only needed for the test-payment check)");
  } else if (!keyId.startsWith("rzp_test_")) {
    bad("RAZORPAY_KEY_ID must start with rzp_test_");
  } else {
    // Read-only call: lists at most one order. Creates nothing.
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64") },
    });
    if (res.ok) ok(`Razorpay test keys valid (${mask(keyId)})`);
    else bad(`Razorpay rejected the keys (HTTP ${res.status})`);
  }

  console.log(failures ? `\n${failures} problem(s) found.` : "\nStaging configuration looks good.");
  process.exit(failures ? 1 : 0);
}

void main();
