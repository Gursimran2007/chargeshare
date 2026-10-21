/**
 * Applies migrations to the staging database and loads the fictional demo data.
 * - AUTH_PROVIDER=supabase: demo users are created through the Supabase Auth admin API.
 * - AUTH_PROVIDER=local (plain Postgres): the local auth shim is applied and users are
 *   created by the app's own local auth.
 *   npm run staging:seed            # first time
 *   npm run staging:seed -- --reset # wipe app data + demo/E2E users, then reseed
 * --reset refuses to run if any account other than demo/E2E test accounts exists.
 */
import { createClient } from "@supabase/supabase-js";
import { createPool, migrate } from "../src/lib/db/core";
import { seedDemoData } from "../src/lib/seed";
import { assertStagingSafe, need } from "./staging-lib";

async function main() {
  assertStagingSafe();
  const reset = process.argv.includes("--reset");
  const local = process.env.AUTH_PROVIDER === "local";
  const db = await createPool(need("DATABASE_URL"));
  const admin = local ? null : createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const isTestAccount = (email: string) => /@chargeshare\.demo$/.test(email) || /^e2e\.host\.\d+@example\.com$/.test(email);

  try {
    await migrate(db, { withShim: local });
    console.log("✓ migrations applied");

    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.profiles");
    if (rows[0].n > 0 && !reset) {
      console.log(`Database already has ${rows[0].n} profiles. Use --reset to wipe and reseed.`);
      process.exit(0);
    }
    if (reset) {
      const users: { id: string; email?: string }[] = [];
      if (admin) {
        for (let page = 1; ; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          users.push(...data.users);
          if (data.users.length < 200) break;
        }
      } else {
        users.push(...(await db.query<{ id: string; email: string }>("select id, email from auth.users")).rows);
      }
      const others = users.filter((u) => !isTestAccount(u.email ?? ""));
      if (others.length) {
        console.error(`✗ Refusing to reset: ${others.length} non-test account(s) exist in this project.`);
        process.exit(1);
      }
      // CASCADE would also empty platform_settings (its updated_by references profiles),
      // so configured settings are snapshotted and restored around the wipe.
      const { rows: settings } = await db.query<{ key: string; value: unknown; description: string }>(
        "select key, value, description from public.platform_settings",
      );
      // TRUNCATE (not DELETE) is needed: the ledger and audit log reject row deletes by design.
      await db.query(`truncate public.ledger_entries, public.payment_events, public.refunds, public.payments, public.payouts,
        public.booking_events, public.messages, public.reviews, public.bookings, public.support_tickets, public.reports,
        public.notifications, public.admin_audit_logs, public.analytics_events, public.charger_photos,
        public.charger_verifications, public.availability_rules, public.blocked_times, public.charger_listings,
        public.host_profiles, public.vehicles, public.user_roles, public.profiles, internal.rate_limits cascade`);
      if (admin) {
        for (const u of users) {
          const { error } = await admin.auth.admin.deleteUser(u.id);
          if (error) throw error;
        }
      } else {
        await db.query("truncate auth.local_sessions, auth.local_password_resets, auth.users cascade");
      }
      // Restore settings last: both wipes above cascade into platform_settings.
      for (const st of settings) {
        await db.query(
          "insert into public.platform_settings (key, value, description) values ($1, $2, $3) on conflict (key) do update set value = excluded.value",
          [st.key, JSON.stringify(st.value), st.description],
        );
      }
      console.log(`✓ wiped app data and ${users.length} test account(s)`);
    }

    await seedDemoData(db, new Date(), {
      createUser: admin ? async ({ email, password, fullName }) => {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
        if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
        return data.user.id;
      } : undefined,
    });
    const { rows: s } = await db.query<{ l: number; b: number }>(
      "select (select count(*)::int from public.charger_listings) as l, (select count(*)::int from public.bookings) as b",
    );
    console.log(`✓ seeded demo data: ${s[0].l} listings, ${s[0].b} bookings (all flagged as demo)`);
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

void main();
