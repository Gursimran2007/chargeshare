# Engineering decision log

Short records of the choices that would be expensive to reverse. Newest last.

### D1. One Next.js app (App Router) with server actions; no separate API service
Business logic lives in `src/lib/services/*` as plain functions taking `(db, actor, input, now)`. Pages and server actions call them; tests call them directly.
**Trade-off:** no public REST API yet. A mobile app would need thin route handlers over the same services.

### D2. Postgres everywhere; PGlite for demo and tests
The same SQL migrations, exclusion constraints, triggers and RLS run in embedded PGlite (demo mode, Vitest, E2E) and on Supabase.
**Why:** the first build of a sister project could never be run without a cloud database. Here, investors and engineers can run everything offline, and the tests exercise the real schema.
**Trade-off:** PGlite is single-process. Demo mode must not be used as a production datastore.

### D3. Trusted server writes + RLS as defence in depth
The server writes through a privileged connection after explicit role, ownership and state checks. RLS and triggers protect any access made with an end-user JWT, and a few reads run as the user (`db.asUser`).
**Trade-off:** two layers to keep in sync. `tests/security.test.ts` checks both.

### D4. Booking conflicts: row lock + server re-check + exclusion constraint
The listing row is locked (`FOR UPDATE`) and availability is re-validated in the transaction. A `btree_gist` exclusion constraint on `tstzrange(start_at, block_end_at)` is the final guard against races.
**Trade-off:** requires the `btree_gist` extension, which Supabase supports.

### D5. Time-based pricing; no energy metering
Without a charger integration, the platform cannot measure kWh honestly. Prices are per reserved hour plus an optional fee; energy is shown only as an estimate.
**Revisit when:** OCPP integration with commercial hosts is available.

### D6. Money as integer paise with an append-only ledger
Capture posts `booking_gross`, `host_share`, `platform_commission` and estimated `tax_on_commission` and `processing_fee` entries. Refunds post proportional reversals; payouts post when marked paid. Updates and deletes are blocked by a trigger, and capture is idempotent through a partial unique index.
**Trade-off:** tax and fee entries are estimates until settlement data is imported.

### D7. Payment provider adapter; demo provider uses Razorpay's HMAC scheme
The same verify → capture → ledger code runs for demo and live payments. **Simulated payments are refused outside demo mode** (`src/lib/payments/mode.ts`) unless `ALLOW_DEMO_PAYMENTS=true` is set for a private staging environment, so a misconfigured production deploy cannot confirm bookings for free.

### D8. Manual payouts; no Razorpay Route assumption
Route eligibility depends on RBI payment-aggregator rules and a turnover test (see `docs/RESEARCH.md`). Admins create payouts from completed-session balances and record the transfer reference.

### D9. Host-confirmed session completion
The host marks the session started and completed, stored as `completion_method = host_confirmed`, and the UI says so. Drivers can dispute within 72 hours, which holds the host's share.

### D10. Five independent verification checks; activation enforced in the database
Identity, property permission (now including the electricity tariff category), charger spec, installation and electrical safety are separate rows, each with status, reviewer and date. A trigger blocks `status = 'active'` unless all five are verified. Changing hardware or location sends the listing back to review. Suspending a listing **cancels and refunds its upcoming bookings** (D13).

### D11. Expiry: lazy per-listing + throttled global sweep + cron endpoint
Holds are expired when someone books that charger, by a once-a-minute sweep on pages that show bookings, and by `POST /api/cron/sweep` (with `CRON_SECRET`) for scheduled runs. No job queue yet.

### D12. Rate limits in Postgres
A fixed-window counter in `internal.rate_limits` works across instances without Redis. It covers login, sign-up, password reset, bookings, messages, tickets, reports and uploads.

### D13. Safety cascade on suspension
When a listing is suspended (by an admin, a failed verification, or a host restriction), upcoming bookings are cancelled with a full refund and drivers are notified. In-progress sessions are left alone and counted in the audit entry.

### D14. Next.js Cache Components disabled
Every page is per-user and dynamic, so opting out kept the auth code simple. Revisit for public marketing pages.

### D15. E2E with Playwright against the locally installed Chrome
`channel: "chrome"` avoids downloading browsers. Tests run against a production build with a throwaway database. The data directory is cleaned in the web-server command, because Playwright starts the server before `globalSetup`.

### D16. Toasts fire from the action continuation, not from an effect
A server re-render often removes the form that submitted it (e.g. "Accept request"), so effect-based toasts were silently lost. `withToast()` wraps the action instead.

### D17. Nonce-based CSP in the proxy
Each HTML request gets a fresh nonce and `script-src 'self' 'nonce-…' 'strict-dynamic'`. Next.js applies the nonce to its own scripts, and Razorpay's checkout loader is trusted through `strict-dynamic`. Styles keep `'unsafe-inline'`. Tile and Razorpay origins come from configuration (`src/lib/csp.ts`, unit-tested). Every E2E journey fails on any CSP violation, so a new third-party script can't be added without updating the policy.

### D18. Follow-ups are idempotent maintenance steps, not a job queue
`runMaintenance()` expires holds, reminds hosts at 50% of the request window (`host_reminded_at`), and escalates sessions still unconfirmed 2 h after the slot ends (`escalated_at`). It alerts admins, asks the host to confirm and tells the driver how to dispute. Each step marks its rows so it acts once. It runs throttled on page loads and from `/api/cron/sweep`.
**Revisit when:** volume needs retries/backoff (then use a queue such as pg-boss or Supabase cron).

### D19. Finance exports as CSV route handlers
Admin exports (ledger, bookings, refunds, payouts; IST date range) are audited. The host statement runs as the host so RLS scopes it. Amounts are written as numeric rupees; text cells are protected against formula injection.

### D20. Own repository, published by git subtree; CI at its root
ChargeShare lives in a private repo, `Gursimran2007/chargeshare`. Development happens in a subdirectory of a personal monorepo, and the app folder is published with `git subtree push`, which keeps the project's commit history. `.github/workflows/ci.yml` runs `npm ci`, a production dependency audit, `npm run check` and `npm run build`, then the Playwright suite against the runner's preinstalled Chrome.

### D21. Email is queued in the transaction and delivered after commit
`notify()` writes an email row (`delivery_status = 'pending'`) in the same transaction as the business change, so a rolled-back action never sends mail. The maintenance worker claims rows with `FOR UPDATE SKIP LOCKED`, sends through the configured transport (Resend, or the outbox when unconfigured), retries 3 times, and records the outcome. Real sends are limited to `EMAIL_ALLOWLIST` unless `EMAIL_ALLOW_ALL_RECIPIENTS=true` in production.

### D22. Accessibility as a test gate
`e2e/a11y.spec.ts` runs axe-core (WCAG 2.1 A/AA) on 22 pages and fails on serious or critical issues. The first run found real defects: status colours below 4.5:1, invalid `<dl>` nesting, and accessible names that didn't match visible text. The colour tokens were darkened to pass.

### D23. Outage behaviour
Database errors in a page render `error.tsx` (with `retry()`, which re-fetches). Errors in the root layout (session lookup) render `global-error.tsx`. The `pg` pool logs idle-client errors instead of crashing the process, and `/api/health` returns 503. Anonymous visitors can still read static pages, because the session lookup skips the database when there is no session cookie.

### D24. Strip image metadata in-house rather than re-encode
Uploaded photos are public once a listing is live, and phone photos carry GPS. `src/lib/image-metadata.ts` removes EXIF/XMP/IPTC segments from JPEG, PNG and WebP without decoding pixels, so no native image library is needed. Malformed files are rejected.
**Trade-off:** the EXIF orientation is lost too; a few photos may need re-uploading upright.

### D25. Reconciliation as executable invariants
`src/lib/services/reconciliation.ts` encodes nine accounting and state invariants as SQL. They run on the admin page and in tests, including after UI-driven refunds in E2E. Matching against provider settlement files is a later step.

### D26. Staging is a local production build on real Supabase + Razorpay test mode
It is free and private, needs no cloud account beyond Supabase and Razorpay, and exercises Supabase Auth, RLS, Storage and the migrations for real. Demo users are created through the Supabase Auth admin API. The scripts refuse live Razorpay keys and non-localhost URLs, and `--reset` refuses to touch non-test accounts. Not covered: Razorpay webhooks, which need a public URL, i.e. a cloud deploy or tunnel (a founder decision).

