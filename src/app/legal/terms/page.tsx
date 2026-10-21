import { ProsePage } from "@/components/prose";
import { brand } from "@/lib/brand";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <ProsePage eyebrow="Policies" title="Terms of service" updated="21 October 2026" draft>
      <p>{brand.name} operates an online marketplace that lets EV drivers book time at chargers owned or managed by independent hosts. {brand.name} does not own, install, operate or maintain the chargers listed.</p>
      <h2>Accounts</h2>
      <ul>
        <li>You must be at least 18 and give accurate information. You are responsible for activity on your account.</li>
        <li>We may restrict accounts that breach these terms, put others at risk or attempt fraud.</li>
      </ul>
      <h2>Bookings and payments</h2>
      <ul>
        <li>Prices are set by hosts and calculated by {brand.name} at booking time. The price shown at checkout is what you pay.</li>
        <li>Payments are processed by a licensed payment provider. {brand.name} does not store card details.</li>
        <li>{brand.name} charges hosts a platform commission (currently 15% of the booking value).</li>
        <li>Cancellations and refunds follow the cancellation policy shown on the listing.</li>
      </ul>
      <h2>Driver responsibilities</h2>
      <ul>
        <li>Only book chargers compatible with your vehicle, use them as instructed and leave on time.</li>
        <li>Follow site rules and access instructions; do not share them with others.</li>
        <li>Stop and report immediately if equipment appears damaged or unsafe.</li>
      </ul>
      <h2>Host responsibilities</h2>
      <ul>
        <li>Only list certified EV charging equipment, installed and maintained by qualified professionals, at property you own or are permitted to use.</li>
        <li>Keep listing details and availability accurate and honour confirmed bookings.</li>
        <li>Maintain appropriate insurance and comply with applicable laws and electricity-utility requirements.</li>
        <li>Do not ask drivers to pay outside {brand.name}.</li>
      </ul>
      <h2>Verification</h2>
      <p>Our checks are based on documents provided by hosts and are not a guarantee of the safety or condition of any equipment or premises.</p>
      <h2>Liability</h2>
      <p>To the extent permitted by law, {brand.name}&apos;s liability is limited to the fees it received for the booking concerned. Nothing in these terms limits liability that cannot be limited by law.</p>
      <h2>Contact</h2>
      <p>{brand.supportEmail}</p>
    </ProsePage>
  );
}
