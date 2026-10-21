# 90-day pilot plan (Chennai)

**Goal:** prove two things before spending on growth.

1. Drivers will book and pay for a stranger's charger.
2. Hosts will reliably provide access when they've said they would.

Every number below is a **hypothesis or target to measure**, not a forecast.

## Prerequisites (weeks −4 to 0)

Do these before the first real booking:

- Get answers to the open legal questions in [RESEARCH.md](RESEARCH.md) §7, especially the electricity tariff category for host-provided charging. If domestic-connection hosting turns out not to be permitted, the pilot uses commercial hosts only (offices, hotels, retail).
- Incorporate the company, register for GST if required, and complete Razorpay onboarding (test mode first).
- Have a lawyer review the Terms, Privacy and Cancellation policies. Arrange insurance cover, or at least written confirmation from hosts' insurers.
- Deploy a staging environment (Supabase + Razorpay test mode) and run the E2E suite against it.
- Write the incident runbook: who answers the phone, how a listing gets suspended, and how drivers get refunded.

## Target cluster

**Recommendation (hypothesis):** the OMR corridor from **Perungudi to Sholinganallur**, with Velachery as overflow.

- It has a dense mix of IT offices with managed parking, gated apartment complexes and hotels, i.e. several host types in a small area.
- EV ownership among commuters there is assumed to be above the city average. **This is unverified.** Test it in week 1 by counting EVs in 3–4 office car parks with the facilities teams' permission.
- One cluster keeps support, verification visits and driver word-of-mouth concentrated.

Alternative if office hosts don't respond: Adyar–Besant Nagar–Thiruvanmiyur, which is mostly independent homes.

## Supply: hosts (target 15–25 verified chargers)

| Channel | What to do |
|---|---|
| Office facility managers | Pitch off-hours monetisation of idle workplace chargers (evenings and weekends). Start with 2–3 introductions. |
| Hotels | Visitor charging; guest-friendly brand signal. |
| RWAs in large complexes | Offer a visitor bay with RWA-controlled hours and a share of revenue to the association. |
| Existing EV owners with wallboxes | Recruit through EV owner WhatsApp groups and service centres, *only if* domestic-connection hosting is cleared. |
| Installers / CPOs | Ask installers to refer customers who already have certified wallboxes. |

**Verification on the ground:** before approval, someone from the team visits every pilot charger in person and records the visit in the electrical-safety check notes. Document review alone is not enough for the pilot.

## Demand: drivers (target 100–200 sign-ups, 40+ booking at least once)

- EV owner communities (Chennai EV clubs, model-specific groups), reached with honest messaging that this is a pilot.
- Office EV commuters at host companies (the "charge at the office after hours" use case).
- Ride-hailing/fleet EV drivers: test separately, since their needs (long sessions, price sensitivity) differ.
- No paid acquisition until completion and repeat rates clear the thresholds below.

## Operations

- **Bookings:** use the in-app flow. The team watches requests and nudges hosts who haven't responded within 1 hour.
- **Support:** one phone number, staffed 7 am–10 pm during the pilot. Log every call as a support ticket so it can be measured.
- **Payouts:** weekly manual transfers through the admin console, reconciled against the ledger.
- **Session completion:** the host confirms in the app. The team spot-checks by calling a sample of drivers.

## Costs to measure

- Support hours per booking.
- Verification cost per host: site visit, document review, travel.
- Payment fees (actual, from Razorpay settlement reports).
- Refunds and goodwill credits.
- Insurance.
- Host and driver acquisition cost, by channel.

## Metrics and thresholds

Definitions are in [METRICS.md](METRICS.md).

| Metric | Expand if (hypothesis) | Rethink if |
|---|---|---|
| Booking completion rate | ≥ 90% | < 75% |
| Host-caused cancellations / no-access | ≤ 3% of bookings | > 10% |
| Median host response time (request-to-book) | ≤ 30 min | > 3 h |
| Drivers who book again within 30 days | ≥ 35% | < 15% |
| Listing → booking conversion | ≥ 8% of listing viewers | < 2% |
| Utilisation of offered hours (active chargers) | ≥ 10% by day 90 | < 3% |
| Contribution per completed booking (after actual fees) | positive | negative with no path to positive |
| Critical safety incidents | 0 | any (pause and review) |

## Decision at day 90

- **Expand:** most thresholds are met. Add one adjacent neighbourhood, then start design-partner talks with an installer or apartment developer.
- **Change the model:** drivers book, but home hosts are unreliable. Pivot towards commercial hosts only, or a managed model where ChargeShare controls access, e.g. via a smart-lock or charger API.
- **Stop or reframe:** drivers don't book even with reliable supply. Investigate whether discovery of public chargers, rather than private access, is the real need.
