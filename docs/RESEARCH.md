# Regulatory, market and payments research

Researched 21 October 2026 with web search. Every item is labelled:

- **Verified fact**: confirmed from an official or primary source I read.
- **External claim**: reported by a secondary source (news, trade press); not checked against the primary document.
- **Founder assumption**: something the business plan currently relies on.
- **Hypothesis**: needs evidence from the pilot.
- **Question for counsel/CA**: needs qualified legal or tax advice. Do not treat my notes as advice.

Nothing here has been verified by a lawyer. Re-check every item before relying on it.

## 1. Is EV charging a licensed activity?

| Item | Label |
|---|---|
| The Ministry of Power clarified on 13 April 2018 that charging EV batteries through a charging station does not require a licence under the Electricity Act, 2003, reasoning that charging is a service and does not involve sale, transmission, distribution or trading of electricity. ([Powerline](https://powerline.net.in/2018/04/09/mop-clarifies-no-license-required-ev-charging-stations/), [Mercom](https://mercomindia.com/ministry-of-power-no-license-ev-charge-station)) | External claim (widely reported; read the original MoP letter) |
| The Ministry of Power issued *Guidelines for Installation and Operation of Electric Vehicle Charging Infrastructure-2024* on 17 September 2024, superseding earlier guidelines and covering private parking, semi-restricted places such as group housing societies, and public places. ([BEE PDF](https://beeindia.gov.in/sites/default/files/Guidelines%20and%20Standards%20for%20EVCI%20dated%2017-09-2024_compressed.pdf), [Powerline](https://powerline.net.in/2024/09/27/ministry-of-power-releases-guidelines-for-installation-and-operation-of-electric-vehicle-charging-infrastructure-2024/), [Renewable Watch](https://renewablewatch.in/2024/09/23/mop-releases-guidelines-for-installation-and-operation-of-electric-vehicle-charging-infrastructure-2024/)) | External claim. **Action: read the PDF's sections on residential/semi-restricted charging and on who may levy service charges.** |
| A Supreme Court PIL seeks enforcement of the 2024 guidelines after a Noida housing society refused a resident's charger installation. ([LiveLaw](https://www.livelaw.in/amp/top-stories/after-housing-society-refuses-permission-for-ev-charger-installation-owner-moves-supreme-court-to-enforce-power-ministry-guidelines-524393)) | External claim. Signals that society/RWA permission is a live friction point. |

**Question for counsel:** Does the 2018 "service, not sale" position, and the 2024 guidelines, extend to a *homeowner or RWA charging third parties* through a marketplace? Or is that only for a designated public charging station with its own connection?

## 2. Electricity connection and tariff category (largest open risk)

| Item | Label |
|---|---|
| TNERC applies a time-of-day tariff for EV charging; a July 2026 revision reportedly set about ₹6.50/kWh (solar hours), ₹9.75 (peak) and ₹8.10 (night), described as for high-tension EV connections. ([DT Next](https://www.dtnext.in/news/tamilnadu/ev-charging-operators-in-tn-face-higher-power-bills-after-tariff-hike-839355)) | External claim. The LT figure is unconfirmed. |
| A host who charges visitors from a **domestic** connection may be using electricity outside its sanctioned tariff category. | **Question for counsel and the discom (TNPDCL).** If yes, hosts may need a separate EV connection or meter, which changes the host economics. |
| Hosts' electricity cost per kWh is roughly ₹6–10. At ₹100–160/hour for a ~7 kW charger (≈6–7 kWh/h delivered), host gross margin per hour is positive before commission. | Founder assumption, based on the reported tariff above. Validate with real bills. |

**Product response already built:** the property-permission check now asks for the connection and tariff category as shown on the electricity bill, so reviewers can see it before approving.

## 3. Apartments and RWAs

| Item | Label |
|---|---|
| Apartment hosts need written permission (RWA or society NOC) for visitor access and use of common-area electricity. | Founder assumption, built into the property-permission check. |
| Security desks and gate rules are the main operational failure point for apartment listings (the seeded demo report illustrates this; it is fictional). | Hypothesis |

## 4. Payments

| Item | Label |
|---|---|
| Razorpay Route (split settlements to vendors through Linked Accounts) is subject to eligibility under RBI Payment Aggregator guidelines issued September 2025. It includes a minimum turnover test and a payer–payee transparency requirement: the linked party must directly provide the goods or services to the customer. Razorpay reviews a written use-case confirmation. ([Razorpay Route docs](https://razorpay.com/docs/payments/route/), [integration guide](https://razorpay.com/docs/payments/route/integration-guide)) | External claim from the provider's documentation. A pre-revenue startup may not meet the turnover test. |
| Therefore ChargeShare should start with standard checkout and **manual payouts**, and apply for Route once eligible. | Recommendation. Already how the product works. |
| GST on commission, whether TCS/TDS applies to marketplace payouts, and whether ChargeShare is an "e-commerce operator" for GST purposes. | **Question for CA** |

## 5. Insurance and liability

| Item | Label |
|---|---|
| Hosts' home or commercial property policies may not cover visitors using EV equipment, or damage to a third party's vehicle. | **Question for insurer/broker** |
| A platform liability policy plus a host-protection programme is likely needed before public launch. | Recommendation |

## 6. Competition and positioning

| Item | Label |
|---|---|
| **Peer-to-peer charging already exists in India.** Bolt.Earth publishes a guide describing P2P charging, where owners of private chargers at homes, housing societies, shops or offices make them available to nearby EV owners, and its app lets owners list as hosts and earn when others charge. ([Bolt.Earth P2P guide](https://bolt.earth/blog/peer-to-peer-ev-charging-in-india-the-complete-guide), [app guide](https://bolt.earth/blog/how-to-use-bolt-earth-ev-charging-app-guide-to-setup-chargers-and-rewards)) | External claim (the company's own content). **Action:** try their host and driver flows hands-on before positioning. |
| Statiq lets users list a new charger in its app and pays ₹100 in charging credit per validated listing. ([Statiq blog](https://statiq.in/blog/ev-charging-with-statiq-is-now-more-rewarding-with-the-list-a-new-charger-feature/)) | External claim |
| Reported public charging in Chennai: 218 public stations as of April 2025 (Tamil Nadu: 1,524). Statiq's undated page lists 259 stations in Chennai. The Greater Chennai Corporation plans 15+ more under a PPP. ([Madras Musings](https://madrasmusings.com/vol-35-no-2/tamil-nadu-looks-to-increase-ev-charging-stations-chennai-to-get-100-new-ones/), [Statiq Chennai](https://www.statiq.in/chennai-ev-charging-station), [Powerline, Mar 2026](https://powerline.net.in/2026/03/17/gcc-to-set-up-ev-charging-stations-in-over-15-locations-in-chennai/)) | External claims, differently dated; treat as order-of-magnitude only |
| ChargeShare is **not** first to private-charger sharing. Its possible edge is the combination of (a) document- and site-verified safety and permission, (b) **reserved** slots with buffers, rather than first-come access, (c) operational accountability (disputes, refunds, host response SLAs) and (d) neighbourhood density in one cluster. | Hypothesis. The pilot must show drivers value reservation and verification enough to choose it over free-to-list incumbents. |
| Partnership routes worth testing: charger installers (refer customers who already have wallboxes), apartment developers and facility managers (visitor-bay revenue), and office parks (off-hours monetisation). | Recommendation. No contact has been made. |

**Not researched (open):** host liability and insurance products available in India for EV charging on private premises; driver acquisition costs by channel. Both need primary research (brokers; small paid tests) once the founder approves spend.

## 7. Precise questions to take to professionals

1. (Counsel/discom) May a domestic or LT-commercial consumer in Tamil Nadu let third parties charge EVs for a fee? Under which tariff category, and is a separate meter or connection required?
2. (Counsel) Under the 2024 MoP guidelines, can a group housing society let non-residents use a society charger? Who can set the service charge?
3. (Counsel) Is ChargeShare a marketplace intermediary, or the provider of the charging service, for consumer-protection and liability purposes?
4. (CA) GST treatment of the commission and of the driver payment; e-commerce operator obligations; TCS/TDS on host payouts.
5. (Insurer) What cover do hosts need, and can ChargeShare offer a group policy?
6. (Razorpay) Route eligibility for a pre-revenue marketplace; the documents needed; timeline.
