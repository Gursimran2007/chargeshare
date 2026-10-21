import { ProsePage } from "@/components/prose";
import { brand } from "@/lib/brand";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ProsePage eyebrow="Policies" title="Privacy policy" updated="21 October 2026" draft>
      <p>This policy explains what {brand.name} collects, why, and your choices. It is intended to align with India&apos;s Digital Personal Data Protection Act, 2023.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, email, phone (optional for drivers, required privately for hosts).</li>
        <li>Vehicle profile: make, model, connectors and charging capability, used for compatibility checks.</li>
        <li>Booking data: times, listings, messages and reviews.</li>
        <li>Host verification documents: identity, property permission, charger and electrical documents, used only for verification and kept access-restricted.</li>
        <li>Payment references from our payment provider. We never receive or store card numbers.</li>
      </ul>
      <h2>How location is protected</h2>
      <ul>
        <li>Listings show an approximate area until a booking is confirmed. The exact address and access instructions are shared only with the driver of a confirmed booking.</li>
        <li>Phone numbers and email addresses are hidden from in-app messages.</li>
      </ul>
      <h2>Who can see what</h2>
      <p>Access is enforced on our servers and in the database: drivers see only their own bookings and payments; hosts see only their own listings, bookings and earnings; a small number of authorised administrators can review records for safety, support and legal reasons, and their actions are logged.</p>
      <h2>Your rights</h2>
      <p>You can access, correct or request deletion of your data, subject to records we must keep for legal, tax or dispute reasons. Contact {brand.supportEmail}.</p>
      <h2>Retention</h2>
      <p>Verification documents are retained while a listing is active and for a limited period afterwards; financial records are kept as required by law.</p>
    </ProsePage>
  );
}
