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
