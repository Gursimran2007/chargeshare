# Product and business metrics specification

Source of truth: Postgres. The append-only `ledger_entries` table backs money metrics, `bookings` and `booking_events` back operations, and `analytics_events` backs the funnel. The admin analytics page (`/admin`) computes the metrics marked ✅ from `src/lib/services/finance.ts → platformMetrics`.

**Demo vs real.** Seeded rows carry `is_demo = true`, and the dashboard shows how many bookings and listings are demo data. Before any investor update, filter `is_demo = false`.

## Pilot priority (the five that matter most in the first 90 days)

1. Booking completion rate
2. Host-caused cancellation / no-access rate
3. Repeat booking rate
4. Listing → booking conversion
5. Contribution per completed booking

## Definitions

| Metric | Definition | Status |
|---|---|---|
| Approved active chargers | Listings with `status = 'active'` (all five checks verified, enforced by DB trigger) | ✅ |
| Listings submitted / approved | Not `draft` / `approved_at` not null | ✅ |
| Search → listing conversion | Distinct visitor ids with `listing_view` ÷ distinct visitor ids with `search`, over the last 30 days | ✅ |
| Listing → booking conversion | Distinct visitor ids with `booking_request` ÷ distinct visitor ids with `listing_view`, over the last 30 days | ✅ |
| Booking conversion | Bookings with a captured payment ÷ all bookings created | ✅ |
| Booking completion rate | `completed` or `refunded` ÷ bookings that reached `confirmed`, whose slot has ended, excluding cancellations | ✅ |
| Repeat booking rate | Drivers with 2+ paid bookings ÷ drivers with 1+ | ✅ (all-time; add a 30-day cohort version for the pilot) |
| Cancellation rate | `cancelled` ÷ all bookings | ✅ |
| Host-caused cancellation rate | Bookings cancelled by the host ÷ bookings that reached `confirmed` | ✅ (no-access disputes are counted separately, via `disputed`) |
| Host response time | Median minutes from booking creation to the host's first accept/decline event | ✅ |
| Gross booking value (GBV) | Sum of `booking_gross` ledger entries | ✅ |
| Commission revenue | Sum of `platform_commission`, net of refund reversals | ✅ |
| Refunds | Sum of `refund` entries; refund rate = refunds ÷ GBV | ✅ |
| Chargebacks | Needs Razorpay dispute webhooks (`payment.dispute.*`) | ❌ not tracked |
| Contribution margin | Commission − GST on commission − gateway fees − refunds absorbed by the platform − support cost per booking | ⚠️ partial: tax and fees are estimates; support cost not captured |
| Host earnings | Per-host `host_share` net of reversals; payout liability = host share − paid payouts | ✅ |
| Charger utilisation | Completed charger-hours ÷ offered charger-hours (from weekly availability), last 30 days. Shown only with ≥ 10 completed sessions | ✅ |
| Driver CAC / host acquisition cost | Spend by channel ÷ new active drivers or hosts | ❌ needs a marketing-spend source; not shown, by design |

## Event tracking

`analytics_events` records `search`, `listing_view`, `checkout_view`, `booking_request` and `signup`, each with a random first-party visitor id (`cs_vid` cookie) and the user id when signed in. No third-party trackers. Writes are server-side only, and RLS restricts reads to admins.

## Not yet measured

Search-to-results quality (zero-result searches), time-to-first-booking per new driver, host churn, support tickets per booking, and verification turnaround time. The data for all of these already exists in the tables.
