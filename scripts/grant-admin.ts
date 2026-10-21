/**
 * Grants the admin role to an existing account (they must have signed up first).
 *   DATABASE_URL=postgres://... npm run admin:grant -- you@example.com
 * The grant is recorded in the audit log. Revoke with --revoke.
 */
import { createPool } from "../src/lib/db/core";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));
const url = process.env.DATABASE_URL;
if (!url || !email) {
  console.error("Usage: DATABASE_URL=postgres://... npm run admin:grant -- <email> [--revoke]");
  process.exit(1);
}
const db = await createPool(url);
try {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ id: string }>("select id from auth.users where email = lower($1)", [email]);
    if (!rows[0]) throw new Error(`No account for ${email}. Sign up in the app first.`);
    if (revoke) {
      await q.query("delete from public.user_roles where user_id = $1 and role = 'admin'", [rows[0].id]);
    } else {
      await q.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict do nothing", [rows[0].id]);
    }
    await q.query(
      "insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason) values (null, $1, 'user', $2, 'via scripts/grant-admin.ts')",
      [revoke ? "role.revoke_admin" : "role.grant_admin", rows[0].id],
    );
  });
  console.log(`${revoke ? "Revoked" : "Granted"} admin for ${email}.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
