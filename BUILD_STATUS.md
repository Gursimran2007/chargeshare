# BUILD_STATUS

_Last updated: 21 October 2026 (session 7)._

**Overall:** pilot-ready MVP in demo mode. All three journeys (driver, host, admin) work end to end against the real database logic and are covered by browser tests. **Not ready for real customers.** That needs live credentials, legal answers and a staging deploy; see "Blocked / external".

## Milestones

| # | Milestone | Commit |
|---|---|---|
| 1 | Full MVP: schema + RLS, booking engine, payments adapter, ledger, verification, driver/host/admin UIs, 66 tests | `3c34a15` |
| 2 | Hardening: payment-mode guard, expiry sweep + cron, rate limits, receipts, health check, funnel metrics, how-it-works page, design restraint, Playwright E2E, two bug fixes found by tests | `a9ef2b8` |
| 3 | Safety cascade on suspension, hold cap, open-redirect fix, host review replies, tariff-category capture, research, pilot plan, metrics spec, decision log, security review | `585595f` |
| 4 | Host request reminders, escalation of unconfirmed sessions + admin "needs attention" queue, finance CSV exports (admin + host), nonce-based CSP, GitHub Actions CI | `0af22ff` |
| 5 | Own private repo `Gursimran2007/chargeshare` (subtree push), CI green on GitHub, actions on v7 | `9026b7c`, + v7 bump |
| 6 | Accessibility gate (axe) + contrast fixes, outage handling (`global-error`, pg pool), 14-day availability calendar, email delivery pipeline with allow-list, review moderation, bucket migration, `admin:grant` script, 30-day repeat and zero-result metrics | `429e576` (CI green) |
| 7 | Photo metadata (GPS) stripping, PDF-as-download, financial reconciliation engine + admin view, demo payout labelling, demo tour, competitor research (P2P incumbents exist) | `23cde64` (CI green) |
| 8 | Staging tooling (env template, check/seed/build/start scripts, E2E against an external URL, docs/STAGING.md); fixed operational scripts that could never run (top-level await under CommonJS) | `848f80f` + `7c3a246` (CI green) |
| 9 | Staging proven on a real PostgreSQL 17 server: migrations, seed, production build, 16/16 E2E twice with a reset between. Fixed two staging-tooling bugs found by running it | _this commit_ |

## Commands actually run (session 5, final run)

| Command | Result |
|---|---|
| `npm run check` (lint, typecheck, Vitest) | clean; **98 passed** (11 files) |
| `npm run test:e2e` (production build, CSP enforced, local Chrome) | **16 passed**, incl. accessibility scans of 24 pages, GPS-tagged photo upload, reconciliation after a UI-driven refund |
| GitHub Actions, previous push (`39646563190`) | **green** (both jobs) |

## Session 7: real-Postgres staging (no accounts needed)

The founder asked for Supabase + Razorpay staging but did not want to create the accounts. Creating accounts and handling their credentials is something the assistant may not do, so that path remains documented (docs/STAGING.md §1–5) and unrun. Instead, staging ran on a **local PostgreSQL 17 server** (Homebrew, data in git-ignored `.data/pg-staging`, stopped afterwards). This was the first time the networked node-postgres adapter ran at all; every earlier test used embedded PGlite.

- **Passed:**
  - Migrations, including the auth shim and `btree_gist`.
  - The seed.
  - All 9 reconciliation checks.
  - A production build.
  - **16/16 E2E tests on two consecutive runs** with `staging:seed -- --reset` between them, with zero server errors.
- **Bug: `staging:build` crashed.** Next.js forwards Node flags to its build workers via `NODE_OPTIONS`, where `--env-file` is forbidden. It's replaced by `scripts/with-env.mjs` (tested).
- **Bug: `--reset` wiped `platform_settings`.** `TRUNCATE … CASCADE` follows `updated_by → profiles`. Settings are now snapshotted and restored after both wipes; a changed commission survives a reset (verified).
- **Still unverified:** Supabase Auth, Supabase Storage, Razorpay test checkout and webhooks. All need the founder's accounts.

## Session 6: staging tooling

- **Bug found:** `npm run db:migrate` and `npm run admin:grant` crashed before doing anything. tsx compiled them as CommonJS, where top-level `await` is illegal. They are fixed (async `main()`), and `tests/scripts.test.ts` now executes every script in CI.
- **New tooling:**
  - `staging:check` validates DB connectivity/TLS, the Supabase admin API, email-confirmation setting and bucket, and Razorpay test keys (read-only call). It prints only masked values.
  - `staging:seed` migrates and seeds via the Supabase Auth admin API, with a guarded `--reset`.
  - `test:e2e:staging` runs the same browser suite against `http://localhost:3260`.
- **Not yet run against real services:** waiting on the founder's accounts (docs/STAGING.md §1–3).

## Session 5 changes

- **Privacy (found in review):** host photos kept their EXIF metadata, so a phone photo's GPS tag could reveal the exact address that listings deliberately hide until booking. Uploads now have EXIF/XMP/IPTC stripped (JPEG, PNG, WebP; tested by unit tests and an E2E upload). Evidence PDFs are served as downloads with `Cross-Origin-Resource-Policy: same-origin`.
- **Financial reconciliation:**
  - Nine invariants run live at `/admin/reconciliation`: ledger postings for captures, refunds and payouts; split balances; refund caps; payment status; host overpayment; paid states having a captured payment.
  - The analytics page shows a status banner.
  - All nine pass on seeded and UI-generated data, and tests show they catch tampering.
- **Honesty:** simulated payouts are labelled on the host earnings and admin payout pages. The demo banner links to a 3-step tour.
- **Research:** peer-to-peer private-charger sharing already exists in India (Bolt.Earth publicly describes it; Statiq lets users list chargers). RESEARCH.md §6, the pilot plan and the how-it-works page now state this, and frame ChargeShare's edge as verification + reservation + operations + density (a hypothesis).

## Session 4 changes

- **Accessibility:**
  - Added axe-core WCAG 2.1 AA scans to E2E. The first run failed on: status-badge colours at 3.0–3.96:1, invalid `<dl>` nesting on charger pages, a bell icon whose accessible name lacked its visible count, low-contrast calendar chips, and (later) calendar-day labels.
  - All are fixed; colour tokens now pass 4.5:1.
- **Reliability:**
  - Added `global-error.tsx` for root-layout failures.
  - `error.tsx` now uses `retry()`, which re-fetches; `reset()` couldn't recover from server errors.
  - The `pg` pool now handles idle-client errors and has a 5 s connect timeout.
- **Driver availability calendar:** a 14-day strip on the booking widget shows which days have open slots for the chosen duration. Also fixed a `<fieldset>` min-content overflow it exposed.
- **Email:**
  - `notify()` queues mail in the business transaction.
  - A worker delivers it via Resend (if configured) or the outbox, with a recipient allow-list, 3 retries, and `SKIP LOCKED` claims.
- **Review moderation:** admin hide/restore with a reason; the author is notified, the action is audited, and hidden reviews leave the public rating.
- **Deployability:**
  - Migration `0007` creates the private Supabase Storage bucket; it is skipped where Storage doesn't exist.
  - `npm run admin:grant -- email` bootstraps the first admin, audited.
- **Metrics:** 30-day repeat rate, zero-result search rate.

## Session 3 changes

- **Host request reminders:** sent once when a request reaches half of its response window (`host_reminded_at`).
- **Escalation of unconfirmed sessions:** 2 h after the slot ends with no host confirmation, admins get an alert, the host is asked to confirm, and the driver is told how to dispute (`escalated_at`). Admin bookings shows a "Needs attention" queue. `/api/cron/sweep` now runs all maintenance.
- **Finance exports:**
  - Admin CSVs for ledger, bookings, refunds and payouts, with an IST date range; every export is audited.
  - Host earnings statement read through RLS.
  - Formula-injection-safe CSV writer.
  - The ledger export reconciles to the paisa (tested).
- **CSP:** per-request nonce with `'strict-dynamic'` and no unsafe scripts in production. Framing, plugins and foreign form posts are blocked. Tile and Razorpay origins come from configuration. E2E journeys fail on any violation.
- **CI:** `.github/workflows/ci.yml`, with a check job (`npm ci`, production audit, `check`, `build`) and an E2E job.

## Known defects / limitations (not fixed)

- No admin 2FA; sign-up reveals whether an email is registered (rate-limited); CSP allows inline styles. See `SECURITY.md`.
- The Resend email adapter and `npm run admin:grant` have not been run against real services (no API key / no real database here).
- 5 high `npm audit` advisories in dev-only ESLint dependencies (fix requires a breaking downgrade); production dependencies are clean.
- Payment provider HTTP calls happen inside DB transactions (acceptable at pilot scale).
- The repeat-booking rate is all-time, not cohort-based. Chargebacks are not tracked. Contribution margin uses estimated tax and fees.
- Geocoding is a fixed list of ~30 Chennai localities. Map tiles are public OSM (development only).
- Admins cannot hide reviews from the UI (the column exists).
- The maintenance sweep runs on page loads and the cron endpoint only. Production needs a real scheduler calling `/api/cron/sweep`.
- Listing covers are illustrations until hosts upload photos. There is no real photography.

## Blocked / external (needs the founder)

| Item | What's needed |
|---|---|
| Live payments | Razorpay account + KYC, test keys first; set `PAYMENT_PROVIDER=razorpay` + 3 secrets; configure webhook (README checklist) |
| Production database / auth / storage | Supabase project (free tier is enough for a pilot); `npm run db:migrate`; bucket; SMTP |
| Legal / tax | Questions in `docs/RESEARCH.md` §7, especially whether hosts can charge third parties on a domestic connection |
| Email delivery | Resend API key + verified sending domain (`RESEND_API_KEY`, `EMAIL_FROM`); pipeline is built and tested with a fake transport |
| Production maps | Tile provider key (MapTiler/Stadia/Mapbox) |

None of these were attempted, because each requires an account, credentials or spending.

## Exact next actions (priority order)

1. Founder: create a Supabase project and Razorpay **test-mode** keys, then deploy a private staging environment (README → Deploying) with a scheduler calling `/api/cron/sweep`, and `EMAIL_ALLOWLIST` set to the team's addresses. Run `npm run test:e2e` against staging by pointing `baseURL` at it.
2. Founder: take the `docs/RESEARCH.md` §7 questions to counsel/CA, then start the `docs/PILOT_PLAN.md` week −4 tasks.
3. Engineering (needs staging): verify the Supabase Auth/Storage adapters, the Razorpay test flow and webhooks, and the Resend adapter end to end.
4. Engineering: Supabase MFA for admins; import actual gateway fees from settlement reports into the ledger.
5. Engineering: time-to-first-booking metric; SMS (MSG91) for booking-critical messages, after DLT registration.

## How to resume without repeating work

```bash
git clone https://github.com/Gursimran2007/chargeshare.git && cd chargeshare
# (or, inside the original monorepo: cd "Desktop/my codes/chargeshare")
npm install
npm run check          # lint + types + 104 tests (~25 s)
npm run test:e2e       # build + 16 browser tests incl. accessibility (~1–2 min; needs Google Chrome)
npm run dev            # demo at http://localhost:3000 (demo accounts on /login)
```

- Read `docs/DECISIONS.md` before changing architecture, and `SECURITY.md` before touching auth, payments or uploads.
- The schema changes only through new files in `supabase/migrations/` (never edit applied ones). The demo DB re-migrates on start; `npm run demo:reset` wipes it.
- Business logic goes in `src/lib/services/*` with a test in `tests/`. UI journeys get an E2E spec in `e2e/`.
- This file is the status of record. Update it at each milestone.
