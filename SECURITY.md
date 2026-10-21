# Security review and production checklist

This file records an adversarial self-review done during the build. It is not an external audit. Commission a professional penetration test before taking real payments.

## Threat review

| Question | Mitigation | Evidence |
|---|---|---|
| Can two drivers book the same slot? | Listing row lock, server re-check and a DB exclusion constraint | `tests/bookings.test.ts` (concurrent bookings, raw insert rejected) |
| Can a client change the price? | Price computed only on the server from the listing and snapshotted; client amounts ignored; RLS blocks direct inserts | `bookings.test.ts`, `security.test.ts` |
| Can an unverified charger go live? | Trigger blocks `active` unless 5 checks are verified; approval is admin-only | `security.test.ts` |
| Can a host approve their own verification? | Service rejects it (admins too, for their own); trigger blocks non-admin decision writes | `security.test.ts` |
| Can a user read another user's booking, payment or profile? | Server ownership checks (404 for non-participants) + RLS | `security.test.ts` (RLS), `bookings.test.ts` (IDOR) |
| Can a host manipulate earnings or payouts? | Ledger is append-only and server-written; payouts are admin-only; hosts see their ledger through RLS | `payments.test.ts`, `security.test.ts` |
| Can a webhook be forged or replayed? | HMAC over the raw body; event-id dedupe; idempotent capture; amount check | `payments.test.ts`, `e2e/access.spec.ts` |
| Can a failed payment leave a confirmed booking? | Booking confirms only inside the capture transaction; failure marks the payment failed and the booking stays unpaid and retryable | `payments.test.ts`, `e2e/driver.spec.ts` |
| Can a refund be recorded twice? | Booking row locked; refunds capped at captured minus prior refunds | `payments.test.ts` |
| Can a misconfigured deploy confirm bookings without payment? | Simulated payments refused outside demo mode | `tests/ops.test.ts` |
| Can admin privileges be escalated? | Roles only granted server-side; RLS revokes role writes; every admin action re-checks the role | `security.test.ts`, `e2e/access.spec.ts` |
| Unsafe uploads? | 5 MB limit; JPG/PNG/WebP/PDF checked by magic bytes (no SVG); served with `Content-Security-Policy: default-src 'none'` and `nosniff`; evidence restricted to owner and admins | `e2e/access.spec.ts` |
| Premature address exposure? | Public view exposes only approximate location; exact address shown only to confirmed bookings, the host and admins | `security.test.ts` |
| Brute force / spam? | Postgres rate limits on auth, booking, messaging, uploads, tickets and reports; cap of 3 open unpaid holds per driver | `ops.test.ts`, `bookings.test.ts` |
| Open redirects? | `next` parameter restricted to same-site paths (rejects `//` and `/\`) | code review |
| Dangerous listing with future bookings? | Suspension cancels and refunds upcoming bookings | `bookings.test.ts` |
| Secret exposure? | Secrets are server-only env vars; `.env*` ignored except `.env.example`; error messages to users are generic, with details logged server-side | code review |
| XSS / script injection? | React escaping; no `dangerouslySetInnerHTML`; nonce-based CSP with `'strict-dynamic'` (no inline or eval scripts in production), `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'` | `tests/csp.test.ts`, `e2e/access.spec.ts` (nonce applied, rotates per request); E2E journeys fail on any CSP violation |
| Spreadsheet formula injection in finance exports? | Text cells beginning with `= + - @` are prefixed with `'`; numbers stay numeric; exports are admin-only (hosts get their own RLS-scoped statement) and every export is audited | `tests/exports.test.ts`, `e2e/access.spec.ts` |
| CSRF on server actions? | Next.js server actions check the request Origin; session cookie is `SameSite=Lax`, `HttpOnly` and `Secure` in production | framework |

## Known gaps (fix before launch)

- CSP keeps `style-src 'unsafe-inline'` (React style attributes and the toast library need it; inline CSS cannot run code).
- No 2FA for admins. No email verification enforced in local auth (Supabase Auth can enforce it).
- Sign-up reveals whether an email is registered (it is rate-limited).
- Rate limits use the first `X-Forwarded-For` hop. Make sure the hosting proxy overwrites that header.
- Payment provider calls run inside DB transactions. A provider outage holds a row lock until the HTTP timeout.
- CI blocks on high/critical advisories in **production** dependencies only. `npm audit` reports 5 high advisories in the dev-only ESLint chain (`braces` via `eslint-config-next`); the suggested fix downgrades to v14, so this is tracked rather than forced.
- No malware scanning of uploaded PDFs.
- Admin page titles reveal that `/admin` routes exist (the content returns 404).

## Production checklist

- [ ] `SESSION_SECRET` (32+ random chars), `CRON_SECRET`, Razorpay keys and webhook secret stored in the host's secret manager
- [ ] `DEMO_MODE` unset/false; `ALLOW_DEMO_PAYMENTS` unset
- [ ] Supabase: migrations applied, private storage bucket, SMTP configured, email confirmation on, redirect URLs restricted
- [ ] Cron calling `/api/cron/sweep` every 5 minutes
- [ ] Error tracking and log retention; database backups and point-in-time recovery enabled
- [ ] External penetration test; admin accounts with 2FA (Supabase MFA)
