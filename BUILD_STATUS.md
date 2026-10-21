# BUILD_STATUS

_Last updated: 21 October 2026 (session 3)._

**Overall:** pilot-ready MVP in demo mode. All three journeys (driver, host, admin) work end to end against the real database logic and are covered by browser tests. **Not ready for real customers.** That needs live credentials, legal answers and a staging deploy; see "Blocked / external".

## Milestones

| # | Milestone | Commit |
|---|---|---|
| 1 | Full MVP: schema + RLS, booking engine, payments adapter, ledger, verification, driver/host/admin UIs, 66 tests | `3c34a15` |
| 2 | Hardening: payment-mode guard, expiry sweep + cron, rate limits, receipts, health check, funnel metrics, how-it-works page, design restraint, Playwright E2E, two bug fixes found by tests | `a9ef2b8` |
| 3 | Safety cascade on suspension, hold cap, open-redirect fix, host review replies, tariff-category capture, research, pilot plan, metrics spec, decision log, security review | `585595f` |
| 4 | Host request reminders, escalation of unconfirmed sessions + admin "needs attention" queue, finance CSV exports (admin + host), nonce-based CSP, GitHub Actions CI | _this commit_ |

## Commands actually run (session 3, final run)

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **85 passed** (8 files) |
| `npm run test:e2e` (production build + Playwright, local Chrome, CSP enforced) | **13 passed** (11 desktop, 2 mobile), zero CSP violations |
| `next build` | succeeds, 0 warnings |
| CI simulation on a clean copy: `npm ci` → `npm audit --omit=dev --audit-level=high` → `npm run check` | passes (0 production advisories, 85 tests) |
| Dev server with CSP | no violations; map tiles load |
| GitHub Actions | **not run**: the branch has not been pushed |

## Defects found and fixed this session

1. **Simulated payments could confirm bookings in a non-demo deployment** (default `PAYMENT_PROVIDER=demo`). Now refused outside demo mode (`src/lib/payments/mode.ts`; tested).
2. **Amount-mismatch flag rolled back** with the capture transaction, so a short payment wasn't recorded as failed. Now written in a separate transaction (found by a test).
3. **Success toasts lost** when the submitting form disappears after the server re-render (accept request, resolve dispute, verification decisions). Fixed with `withToast()` (found by E2E).
4. **Stale "Awaiting payment" bookings** shown forever. Fixed with a platform-wide expiry sweep plus a cron endpoint, and drivers are notified.
5. **Suspended listings kept their upcoming bookings.** Suspension now cancels them, refunds paid bookings in full and notifies drivers (tested).
6. **Open redirect** on `/login?next=//host` when already signed in. Fixed.
7. **Slot griefing:** unlimited unpaid holds per driver. Now capped at 3 (tested).
8. **No rate limiting.** Added Postgres-backed limits on auth, booking, messages, uploads, tickets and reports (tested).
9. **E2E harness deleted the database under the running server** (Playwright starts the server before `globalSetup`). Cleanup moved into the server command.
10. **Design:** removed glows, blur halos, ping animation and the childish listing art; tightened radii; replaced the "photos appear here" placeholder with the approximate-area map; added a map tile-failure fallback.

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
- 5 high `npm audit` advisories in dev-only ESLint dependencies (fix requires a breaking downgrade); production dependencies are clean.
- The CI workflow has never run on GitHub. The repo's `origin` remote is `Gursimran2007/poker-advisor`, which looks unrelated, so decide where ChargeShare should live before pushing.
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
| Email/SMS delivery | Provider account (e.g. Resend/SES/MSG91); currently written to `/dev/outbox` |
| Production maps | Tile provider key (MapTiler/Stadia/Mapbox) |

None of these were attempted, because each requires an account, credentials or spending.

## Exact next actions (priority order)

1. Founder: decide which GitHub repository ChargeShare belongs in (probably its own), push, and confirm the CI workflow goes green there.
2. Founder: create a Supabase project and Razorpay **test-mode** keys, then deploy a private staging environment (README → Deploying) with a scheduler calling `/api/cron/sweep`. Run `npm run test:e2e` against staging by pointing `baseURL` at it.
3. Engineering: wire a real email provider behind `notify()` (`src/lib/services/common.ts`) with an allow-list during staging.
4. Engineering: Supabase MFA for admins; admin review moderation (hide/unhide); import actual gateway fees from settlement reports into the ledger.
5. Engineering: a 30-day repeat-booking cohort metric; zero-result search tracking.
6. Founder: take `docs/RESEARCH.md` §7 questions to counsel/CA; then start `docs/PILOT_PLAN.md` week −4 tasks.

## How to resume without repeating work

```bash
git clone https://github.com/Gursimran2007/chargeshare.git && cd chargeshare
# (or, inside the original monorepo: cd "Desktop/my codes/chargeshare")
npm install
npm run check          # lint + types + 85 tests (~20 s)
npm run test:e2e       # build + 13 browser tests (~1–2 min; needs Google Chrome)
npm run dev            # demo at http://localhost:3000 (demo accounts on /login)
```

- Read `docs/DECISIONS.md` before changing architecture, and `SECURITY.md` before touching auth, payments or uploads.
- The schema changes only through new files in `supabase/migrations/` (never edit applied ones). The demo DB re-migrates on start; `npm run demo:reset` wipes it.
- Business logic goes in `src/lib/services/*` with a test in `tests/`. UI journeys get an E2E spec in `e2e/`.
- This file is the status of record. Update it at each milestone.
