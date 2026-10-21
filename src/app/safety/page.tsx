import { ProsePage } from "@/components/prose";
import { CHECK_INFO, type CheckType } from "@/lib/services/verification";

export const metadata = { title: "Safety & verification" };

export default function SafetyPage() {
  return (
    <ProsePage eyebrow="Trust & safety" title="Safety & verification standards" updated="21 October 2026">
      <p>
        ChargeShare only lists chargers that pass separate, documented checks reviewed by our team. A badge on ChargeShare never means &ldquo;this person signed up&rdquo; or &ldquo;uploaded a photo&rdquo;. Each check below has its own status, reviewer decision and date, and can be suspended at any time.
      </p>
      <h2>The five checks</h2>
      <ul>
        {(Object.keys(CHECK_INFO) as CheckType[]).map((k) => (
          <li key={k}><strong>{CHECK_INFO[k].title}.</strong> {CHECK_INFO[k].what} Evidence: {CHECK_INFO[k].evidence}</li>
        ))}
      </ul>
      <p>
        Check statuses are: <em>Not submitted</em>, <em>Pending review</em>, <em>Additional information required</em>, <em>Verified</em>, <em>Rejected</em> and <em>Suspended</em>. A listing is only bookable when all five are Verified. If a host changes the connector, power rating, charger model or location, the affected checks go back to review.
      </p>
      <h2>What we do not claim</h2>
      <ul>
        <li>We do not show real-time charger status. Availability comes from the host&apos;s schedule and bookings on ChargeShare.</li>
        <li>We do not meter energy or control chargers remotely. Session start and completion are confirmed manually by the host.</li>
        <li>Document review is not a substitute for a site inspection. Our reviewers check that the evidence is consistent and current; the electrical safety report must come from a licensed electrical contractor.</li>
      </ul>
      <h2>What we never accept</h2>
      <ul>
        <li>Ordinary household sockets, extension leads or improvised adapters.</li>
        <li>Installations without a dedicated circuit and appropriate residual-current protection.</li>
        <li>Parking spaces the host does not own or have written permission to offer.</li>
      </ul>
      <h2 id="checklist">Pre-launch checklist for hosts</h2>
      <p>Before listing, every host should be able to confirm:</p>
      <ul>
        <li>A qualified electrical inspection of the installation within the last 12 months (earthing, cable rating, RCD/RCBO).</li>
        <li>Property and, for apartments, resident welfare association or society permission for visitor access and charging.</li>
        <li>Insurance that covers visitors on the premises and the charging equipment, or confirmation from the insurer.</li>
        <li>An incident plan: how to isolate the charger, who to call, and how to reach ChargeShare.</li>
        <li>Compliance with applicable local requirements, including those of the electricity distribution company (for example, connected-load or tariff category) and the Central Electricity Authority&apos;s guidelines for EV charging infrastructure.</li>
      </ul>
      <h2>Incidents</h2>
      <p>
        If there is fire, smoke, sparking, a burning smell or an injury: stop charging if it is safe to do so, move away, and call 112. Then report the incident from the booking page. Safety reports are triaged as critical, the listing can be suspended immediately, and payouts for the session are held while we investigate.
      </p>
    </ProsePage>
  );
}
