# ChargeShare

A marketplace for booking existing, safely installed EV chargers in India: homes, apartment complexes, offices, hotels and retail car parks. Drivers find a compatible charger, reserve a slot, pay and charge. Hosts list chargers, set hours and prices, and earn from idle charging time. ChargeShare takes a configurable commission (15% by default).

This repository is a production-minded MVP. It runs fully offline in **demo mode** with fictional Chennai listings and simulated payments, and switches to Supabase + Razorpay through environment variables.

| Document | What it covers |
|---|---|
| [BUILD_STATUS.md](BUILD_STATUS.md) | Current state, commands run and their results, known defects, next actions |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Engineering decision log |
| [SECURITY.md](SECURITY.md) | Adversarial review, known gaps, production checklist |
| [docs/RESEARCH.md](docs/RESEARCH.md) | Regulatory, tariff and payments research, labelled fact / claim / assumption |
| [docs/PILOT_PLAN.md](docs/PILOT_PLAN.md) | 90-day Chennai pilot with expansion thresholds |
| [docs/METRICS.md](docs/METRICS.md) | Metric definitions and what is tracked |
| [docs/STAGING.md](docs/STAGING.md) | Step-by-step private staging on Supabase + Razorpay test mode |
| `/how-it-works` (in the app) | Business model, live unit economics, real vs simulated |

> **Demo data is fictional.** Every seeded host, listing, booking, review and payment is made up. Seeded verification checks are flagged `is_simulated` and are labelled "simulated" everywhere in the UI. No money moves in demo mode.

---

## Quick start (demo mode, zero configuration)

Requirements: Node.js 20.9+ (tested on 22).

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first start the app creates an embedded Postgres database in `.data/pglite`, applies every migration (including RLS policies) and seeds demo data. To start over: `npm run demo:reset`.

### Demo accounts

All passwords: `Demo@1234`. The sign-in page lists them with one-click sign-in.

| Role | Email | What to try |
|---|---|---|
| Driver | `driver@chargeshare.demo` | Search the map, book and pay (demo), cancel and see the refund, message the host, review a completed session |
| Host | `host@chargeshare.demo` | Accept the pending request, start/complete a session, view earnings and the ledger, block dates, edit a listing |
| Admin | `admin@chargeshare.demo` | Verification queue, approve the Porur listing, resolve the disputed T. Nagar booking, refunds, payouts, analytics, audit log |
| New host | `newhost@chargeshare.demo` | A listing waiting in the verification queue |

Other seeded hosts: `rwa@`, `office@`, `hotel@`, `retail@chargeshare.demo`; second driver `driver2@chargeshare.demo`.

Emails (booking confirmations, password resets) are captured in the **demo outbox** at `/dev/outbox`.

---

## Architecture

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Turbopack), TypeScript, Tailwind CSS v4 | One deployable; business logic stays on the server |
| Database | PostgreSQL. Supabase in production; **PGlite** (Postgres compiled to WASM) in demo mode and tests | The *same* SQL migrations, constraints, triggers and RLS policies run everywhere, so tests exercise the real schema |
| Auth | Adapter: Supabase Auth (`@supabase/ssr`) or a local adapter (scrypt + revocable DB sessions) for demo | Demo works without accounts on any service |
| Payments | `PaymentProvider` interface with `demo` and `razorpay` adapters | Demo uses the same HMAC signature scheme as Razorpay, so the identical verification/capture code runs in both |
| Maps | Leaflet with configurable raster tiles (OpenStreetMap by default) | No API key needed for development |
| Storage | Local disk in demo; Supabase Storage via service key otherwise | Uploaded files are validated by magic bytes and served through an access-checked route |
| Validation | Zod schemas shared by forms and server actions | |
| Tests | Vitest against in-memory PGlite | |

Key directories:

```
supabase/migrations/      0001 schema, 0002 integrity triggers + RLS, 0003 reference data
supabase/local/           demo-only shim of Supabase's auth schema/roles (never run on Supabase)
src/lib/domain/           pure logic: pricing, compatibility, availability, cancellation, state machine
src/lib/services/         server-side business operations (bookings, payments, listings, verification, finance, admin)
src/lib/payments/         demo + Razorpay providers and HMAC helpers
src/lib/auth/             auth adapter and request-scoped viewer
src/app/                  routes (driver, host, admin, auth, policies, API)
tests/                    unit + integration tests (Vitest, in-memory Postgres)
e2e/                      browser journeys (Playwright, local Chrome, desktop + mobile)
docs/                     decisions, research, pilot plan, metrics
```

### Trade-offs worth knowing

- **Server-side services + RLS as defence in depth.** The Next.js server performs all writes through a trusted database connection after its own authorisation checks (role, ownership, state). RLS policies and triggers additionally protect anything reached with an end-user JWT, e.g. a browser using the Supabase anon key. Some reads deliberately run *as the user* (host ledger, profile/vehicle writes) so RLS is in the loop. Tests cover both layers.
- **Time-based pricing only.** With no metering integration, the platform charges per booked hour (plus an optional host booking fee). Energy estimates are shown as estimates with a disclaimer.
- **Manual session completion.** Hosts confirm start and completion; it is labelled as a manual confirmation everywhere and stored as `completion_method = host_confirmed`.
- **Manual payouts.** Admins create payouts from completed-session balances and record the bank/UPI reference. Automated split settlement (e.g. Razorpay Route) needs provider approval and is not assumed.
- **Payment calls inside transactions.** Provider refund calls happen inside the database transaction that records them. Simple and consistent for an MVP; at scale move to an outbox/job queue.
- **Next.js Cache Components are off.** Every page here is per-user and dynamic; opting out kept auth logic simple.

---

## What is implemented

### Driver
Sign up / sign in / password reset · 14-day availability calendar · printable receipts · vehicle profiles with an indicative catalogue of Indian EVs · map + list discovery with locality search, "near me", filters (connector, power, price, access type, instant book, availability on a date/time, compatible with my vehicle) · listing pages with approximate location, specs, hours, five-check verification panel, cancellation policy, reviews · live slot picker, server-computed quote, compatibility and charge estimate · instant book or request-to-book · checkout with a slot-hold countdown · confirmation with exact address, access instructions and directions · upcoming/past bookings · policy-based cancellation with automatic refund · check-in · privacy-masked messaging · disputes within 72 hours · reviews after completion · support tickets and safety reports · notifications.

### Host
Downloadable earnings statement (CSV) · host profile · identity verification with document upload · self-declared safety checklist · six-step listing wizard (charger, location, access, pricing and rules, weekly availability) · photo uploads (public listing photos vs reviewer-only installation photos) · per-listing evidence for property permission, charger spec, installation and electrical safety · submit for review, pause/resume · blocked dates · request accept/decline · weekly calendar · session start/complete · earnings from the ledger (gross, commission, refunds, net, pending, held, paid out, available) · payout history.

### Admin (server-enforced; non-admins get 404)
Analytics (drivers, hosts, listings submitted/approved/active, booking requests, completed sessions, conversion, repeat rate, cancellation and refund rates, GBV, commission, estimated net contribution, payout liability, utilisation only when there are ≥10 recent sessions; seeded data is flagged) · verification queue with per-check decisions and reasons · listing approval, rejection, change requests, suspension · bookings and payments oversight, partial/full refunds, dispute resolution · payouts · user restriction · support tickets and incident reports with severity triage · live financial reconciliation (9 integrity checks) · review moderation (hide/restore, audited) · commission configuration · finance CSV exports (ledger, bookings, refunds, payouts; audited) · "needs attention" queue for sessions that ended without host confirmation · append-only audit log.

### Booking engine
States: `requested → pending_payment → confirmed → checked_in → in_progress → completed`, plus `declined`, `expired`, `cancelled`, `disputed`, `refunded`. Every transition is validated and written to `booking_events`.

- Availability: weekly hours (IST), blocked times, min/max duration, advance notice, 30-minute steps, buffer after every booking.
- Conflicts: the listing row is locked during booking, availability is re-checked on the server, and a Postgres **exclusion constraint** (`btree_gist`) makes overlapping active bookings impossible even under races.
- Holds: unpaid instant bookings hold the slot for 15 minutes; requests expire after 12 hours. Expired holds are released automatically.
- Prices: computed only on the server from the listing and the commission at booking time, and snapshotted on the booking.

### Money
- Integer paise everywhere. `amount = host_share + commission` is a DB check constraint.
- On capture the append-only ledger records `booking_gross`, `host_share`, `platform_commission`, `tax_on_commission` (estimate) and `processing_fee` (estimate) separately. Refunds reverse host share and commission proportionally. Payouts are recorded when marked paid.
- Payment verification: browser callbacks require a valid HMAC signature; webhooks are verified against the raw body; events are deduplicated by event id; capture is idempotent (one order per booking, one ledger posting per payment); amount mismatches are rejected and flagged; payments that arrive after a hold expired are refunded automatically.

### Safety & verification
Statuses: not submitted, pending review, needs info, verified, rejected, suspended. Identity, property permission, charger specification, installation evidence and electrical safety are separate checks. Hosts can never set a decision (DB trigger), listings cannot become active unless all five are verified (DB trigger), changing hardware or location sends the listing back to review, and rejecting/suspending a check takes live listings offline. Household sockets are a non-listable connector category.

---

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on pull requests: `npm ci` → `npm audit --omit=dev --audit-level=high` → `npm run check` → `npm run build`, then the Playwright suite against the Chrome preinstalled on GitHub's Ubuntu runners. Traces are uploaded on failure.

Repository: [github.com/Gursimran2007/chargeshare](https://github.com/Gursimran2007/chargeshare) (private). The app is developed inside a larger personal monorepo and published here with `git subtree push --prefix="Desktop/my codes/chargeshare" chargeshare main`.

## Commands

```bash
npm run dev          # start (demo mode if DATABASE_URL is unset)
npm run build        # production build
npm run start        # serve the production build (requires SESSION_SECRET)
npm run lint
npm run typecheck
npm test             # 104 unit/integration tests against in-memory Postgres
npm run test:e2e     # production build + 16 browser tests incl. accessibility (needs Google Chrome)
npm run admin:grant -- you@example.com   # make an existing account admin (needs DATABASE_URL)
npm run staging:check | staging:seed | staging:build | staging:start | test:e2e:staging   # see docs/STAGING.md
npm run check        # lint + typecheck + test
npm run db:migrate   # apply migrations to DATABASE_URL (Supabase)
npm run demo:reset   # wipe the embedded demo database and uploads
```

### Test coverage

| File | Covers |
|---|---|
| `tests/domain.test.ts` | Pricing (incl. the ₹300 → ₹255/₹45 example), contribution vs commission, compatibility, charge estimates, availability rules and buffers, cancellation policies, state machine |
| `tests/bookings.test.ts` | Server-side pricing, overlap rejection, simultaneous bookings, exclusion constraint, hold expiry, schedule limits, connector compatibility, IDOR on vehicles, own-listing and restricted-account blocks, request-to-book, check-in/completion, reviews, message masking, cancellation refunds (100%/50%/host), in-progress cancellation |
| `tests/payments.test.ts` | Forged signatures, Razorpay HMAC scheme, idempotent capture under concurrency, webhook signature, duplicate events, amount mismatch, failed payments, late-payment auto-refund, refund limits, admin-only refunds, earnings reconciliation, payouts |
| `tests/security.test.ts` | Admin-only actions for drivers/hosts, no self-approval, listing draft/verification rules, household-socket block, DB-enforced activation, listing IDOR, re-review on spec change, **Row Level Security** (profiles, roles, vehicles, bookings, payments, ledger, private addresses, forged writes, verification/listing guards, restriction, audit and ledger immutability), local auth sessions and single-use password resets |
| `tests/seed.test.ts` | Seed integrity and ledger balance |

| `tests/ops.test.ts` | Payment-mode guard (no simulated payments outside demo), rate limiting, platform-wide hold expiry, funnel metrics |
| `e2e/driver.spec.ts` | Real browser: search → slot → demo pay → confirmation → receipt → cancel/refund; simulated failure then retry |
| `e2e/host-admin.spec.ts` | Sign up as host → profile → identity evidence → checklist → 6-step wizard → GPS-tagged photo upload (stored copy verified metadata-free) → 4 evidence uploads → submit → admin verifies 5 checks → approve → listing public; host accepts a request; admin resolves a dispute, then reconciliation still passes |
| `tests/exports.test.ts` | CSV escaping and formula-injection guard, ledger export reconciles to the paisa, date ranges, admin-only exports, host statement limited to own lines |
| `tests/csp.test.ts` | CSP: nonce + strict-dynamic, no unsafe scripts in production, framing blocked, tile and Razorpay origins |
| `e2e/access.spec.ts` | Signed-out redirects, driver blocked from admin (404), CSP nonce applied and rotated, admin CSV download, host statement download, evidence not public, forged webhook rejected, health check |
| `tests/notifications.test.ts` | Email queued transactionally (nothing sent on rollback), allow-list, retries then failure, outbox capture, review moderation |
| `tests/image-metadata.test.ts` | EXIF/GPS, XMP and IPTC stripped from JPEG, PNG and WebP; malformed images rejected |
| `tests/reconciliation.test.ts` | 9 ledger/payment/refund/payout/booking-state invariants pass on service-generated data and catch tampering |
| `tests/scripts.test.ts` | Every operational script (migrate, admin:grant, staging check/seed) actually starts and fails safely without credentials |
| `e2e/a11y.spec.ts` | axe-core WCAG 2.1 A/AA scan of 22 public, driver, host and admin pages; fails on serious/critical violations |
| `e2e/mobile.spec.ts` | Pixel 7 viewport: driver pages, host workspace and admin console with no horizontal overflow; map/list toggle |

See [BUILD_STATUS.md](BUILD_STATUS.md) for the latest recorded results.

---

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Needed for | Notes |
|---|---|---|
| `SESSION_SECRET` | production | 32+ random characters; signs local session cookies |
| `NEXT_PUBLIC_APP_URL` | emails, auth redirects | |
| `DATABASE_URL` | real database | Supabase direct connection string. Setting it turns demo mode off |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth | |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | uploads | Server-only |
| `AUTH_PROVIDER` | optional | `supabase` (default with a database) or `local` |
| `PAYMENT_PROVIDER` | payments | `demo` or `razorpay` (razorpay is refused in demo mode; demo is refused outside demo mode) |
| `ALLOW_DEMO_PAYMENTS` | private staging only | Lets simulated payments run against a real database |
| `RESEND_API_KEY`, `EMAIL_FROM` | real email | Otherwise emails are captured in the outbox |
| `EMAIL_ALLOWLIST` | dev/staging | Only these addresses/@domains get real email |
| `EMAIL_ALLOW_ALL_RECIPIENTS` | production | `true` to email all users (ignored outside production) |
| `CRON_SECRET` | production | Bearer token for `POST /api/cron/sweep`: expire holds, remind hosts, escalate unconfirmed sessions (every ~5 min) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | live payments | Key id is sent to the browser checkout; the secrets never are |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | production maps | Public OSM tiles are for development only |

---

## Deploying with Supabase

1. Create a Supabase project (region: Mumbai, `ap-south-1`).
2. Apply migrations: `DATABASE_URL="postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres" npm run db:migrate` (or `supabase db push`). Do **not** run `supabase/local/`.
3. The private Storage bucket `chargeshare` is created by migration `0007` (5 MB limit, images/PDF only).
4. Auth → URL configuration: site URL = your domain; add `https://<domain>/auth/callback` as a redirect URL. Configure SMTP for production emails.
5. Create your first admin: sign up normally, then run `DATABASE_URL=... npm run admin:grant -- you@example.com` (recorded in the audit log).
6. Deploy to a Node host (Vercel, Render, Railway, a VM). Set the env vars above, plus `SESSION_SECRET` and `CRON_SECRET`. Use Supabase's pooled connection string for serverless platforms. Schedule `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` every 5 minutes. `GET /api/health` is a readiness probe.
   - Plain Postgres instead of Supabase: set `AUTH_PROVIDER=local`; `npm run db:migrate` then also applies the local auth shim.
7. The demo seed is not run against Supabase. Real listings come from real hosts through the onboarding flow.

Notes: the embedded PGlite database is single-process and for demo/testing only; do not use demo mode as a production datastore. Transactional emails other than Supabase Auth's (booking confirmations etc.) are currently written to the `notifications` table with `channel = 'email'`; connect an email provider (Resend, SES, etc.) to deliver them.

---

## Going live with Razorpay: checklist

Code is in `src/lib/payments/razorpay.ts`, `src/app/api/payments/razorpay/verify`, `src/app/api/webhooks/razorpay`. It implements Orders API, Standard Checkout, payment-signature and webhook-signature verification and refunds per Razorpay's documented scheme, but **has not been run against live or test credentials in this repo.**

- [ ] Incorporate the business and complete Razorpay KYC / merchant onboarding (marketplace category, website with policies live).
- [ ] Test mode first: set `PAYMENT_PROVIDER=razorpay` with test keys, a real `DATABASE_URL`, and run full bookings with Razorpay test cards/UPI.
- [ ] Dashboard → Webhooks: point to `https://<domain>/api/webhooks/razorpay`, set the secret, subscribe to `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
- [ ] Verify the webhook flow end to end, including retries (duplicates are acknowledged without reprocessing).
- [ ] Decide on payment capture settings (auto-capture recommended for instant book).
- [ ] Replace estimated gateway fees and GST with figures from Razorpay settlement reports; confirm GST treatment of commission (and whether TCS/TDS applies to marketplace payouts) with a chartered accountant.
- [ ] Decide on payouts: keep manual transfers with a reconciliation process, or apply for Razorpay Route for split settlements. Do not assume Route is available.
- [ ] Turn the driver receipt (`/bookings/[id]/receipt`, currently "not a tax invoice") into GST-compliant invoices once registered, and add commission invoices for hosts.
- [ ] Switch to live keys only after the above; keep secrets in your host's secret manager.

---

## Production-readiness blockers and incomplete integrations

Simulated or not yet connected:
- **Payments** are simulated in demo mode. Razorpay adapter is written but untested with real credentials.
- **Supabase Auth adapter** (sign-in, sign-up, reset via `/auth/callback`) is written to `@supabase/ssr`'s documented API but untested without a project. Demo uses the local adapter.
- **Supabase Storage** upload path is untested without a project; demo stores files in `.data/uploads`.
- **Transactional email** is queued and delivered by a worker through a Resend adapter with a recipient allow-list; without credentials it is captured in the outbox (`/dev/outbox` in demo mode). The Resend adapter is untested without an API key. No SMS.
- **Geocoding** uses a built-in list of ~30 Chennai localities; hosts enter coordinates or use device location. Add a geocoder (Google, Mapbox, Ola Maps) before expanding.
- **Map tiles** default to public OpenStreetMap tiles, which are not for production traffic.
- **No charger telemetry**: no live status, metering or remote control (by design for the MVP; never claimed in the UI).
- **No automated payouts.**

Before accepting real bookings and launching publicly:
- Legal review of Terms, Privacy (DPDP Act 2023), Cancellation policy; company incorporation; GST registration.
- Insurance for the platform and guidance/requirements for host insurance; incident response runbook and on-call contact.
- Clarify electricity-utility (TNPDCL/TANGEDCO) rules on reselling charging time from domestic/commercial connections and CEA EV charging guidelines; require appropriate tariff categories where needed.
- Resident-association / property-manager permission templates (NOC) for apartment hosts.
- A real verification operation: trained reviewers, document retention policy, periodic re-verification (electrical reports expire after 12 months; not yet automated).
- Bot protection on sign-up, email verification enforcement, 2FA for admins (rate limiting is implemented). See [SECURITY.md](SECURITY.md).
- Background jobs run as idempotent maintenance steps (hold expiry, host request reminders, escalation of unconfirmed sessions) on page loads and via the cron endpoint; a real scheduler must call `/api/cron/sweep` in production.
- Observability (error tracking, structured logs, payment reconciliation alerts) and database backups.
- Accessibility audit and real-device mobile testing; real photography in place of illustrated covers.

---

## Changing the brand

Edit `src/lib/brand.ts` (name, tagline, support email, city) and the colour tokens in `src/app/globals.css` (`ink`, `volt`, `go`).
