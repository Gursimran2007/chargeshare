import { ProsePage } from "@/components/prose";
import { POLICY_TEXT, type CancellationPolicy } from "@/lib/domain/cancellation";

export const metadata = { title: "Cancellation policy" };

export default function CancellationPage() {
  return (
    <ProsePage eyebrow="Policies" title="Cancellation & refund policy" updated="21 October 2026" draft>
      <p>Each listing shows one of three policies before you pay. Refunds are calculated automatically from the policy and the time you cancel, measured against the booking&apos;s start time (India Standard Time).</p>
      {(Object.keys(POLICY_TEXT) as CancellationPolicy[]).map((k) => (
        <section key={k}>
          <h2>{POLICY_TEXT[k].title}</h2>
          <ul>{POLICY_TEXT[k].rules.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      ))}
      <h2>Always fully refunded</h2>
      <ul>
        <li>The host cancels or declines your booking.</li>
        <li>ChargeShare cancels a booking, for example because a listing is suspended.</li>
        <li>Your payment arrives after your slot hold expired and the booking could not be confirmed.</li>
      </ul>
      <h2>Unpaid bookings</h2>
      <p>Instant bookings hold the slot for 15 minutes while you pay. Request-to-book requests expire if the host does not respond within 12 hours. You are not charged for either if they lapse.</p>
      <h2>Problems during a session</h2>
      <p>If the charger does not work, access is not possible or the listing is materially inaccurate, report a problem from your booking within 72 hours of the session. Our team reviews disputes with both parties and may issue a full or partial refund.</p>
      <h2>Refund timing</h2>
      <p>Refunds go back to the original payment method. Banks typically take 5 to 7 working days to show a refund after it is processed.</p>
    </ProsePage>
  );
}
