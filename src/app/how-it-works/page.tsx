import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Container, LinkButton } from "@/components/ui";
import { Economics } from "./economics";
import { getDb } from "@/lib/db";
import { getSettingNumber } from "@/lib/services/common";
import { config } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/seed";
import { brand } from "@/lib/brand";

export const metadata = { title: "How ChargeShare works", description: "The problem, the marketplace, the business model and what is real in this build." };

type Label = "Verified in product" | "Assumption" | "Hypothesis to test" | "Simulated in demo";
const TONE: Record<Label, "go" | "warn" | "volt" | "neutral"> = {
  "Verified in product": "go",
  Assumption: "warn",
  "Hypothesis to test": "volt",
  "Simulated in demo": "neutral",
};

const CLAIMS: [string, Label][] = [
  ["Bookings cannot overlap on a charger (database-enforced) and prices are computed server-side.", "Verified in product"],
  ["A listing cannot go live until identity, property permission, charger spec, installation and electrical-safety checks are approved.", "Verified in product"],
  ["Host share, commission, refunds and payouts are kept as separate ledger entries.", "Verified in product"],
  ["Many private and commercial chargers sit idle for large parts of the day.", "Hypothesis to test"],
  ["Drivers will book a stranger's charger if access and reliability are guaranteed.", "Hypothesis to test"],
  ["Hosts will offer access for a share of booking revenue and reliably honour bookings.", "Hypothesis to test"],
  ["A 15% commission is acceptable to hosts and leaves positive contribution.", "Assumption"],
  ["Payment gateway fees of ~2% and GST on commission of 18%.", "Assumption"],
  ["Payments, charging sessions and payouts shown in this build.", "Simulated in demo"],
  ["All hosts, listings, reviews and bookings shown in this build.", "Simulated in demo"],
];

export default async function HowItWorks() {
  const db = await getDb();
  const [commissionBps, taxBps, feeBps] = await Promise.all([
    getSettingNumber(db, "commission_bps"),
    getSettingNumber(db, "tax_on_commission_bps"),
    getSettingNumber(db, "processing_fee_bps"),
  ]);
  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <div className="text-xs font-semibold uppercase tracking-wider text-volt-600">Company overview</div>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">How {brand.name} works</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-600">
        A marketplace that lets EV drivers reserve time at chargers that already exist, at homes, apartment complexes, offices, hotels and retail car parks, operated by verified hosts.
      </p>

      <section className="mt-12 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">The problem</h2>
          <p className="mt-2 text-ink-600">
            Drivers without reliable home charging depend on public stations that may be far away, occupied or not working when they arrive. Meanwhile, chargers installed for one household, office fleet or hotel may be unused for much of the day. Whether that idle capacity is large enough, and accessible enough, is the core hypothesis the pilot must test.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">The product</h2>
          <p className="mt-2 text-ink-600">
            Drivers search a map, see only chargers their vehicle can use, reserve a guaranteed slot and pay upfront. Hosts set hours, prices and rules; the exact address is released only to confirmed bookings. {brand.name} verifies every listing, handles payment and support, and resolves disputes.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Business model</h2>
        <p className="mt-2 text-ink-600">
          {brand.name} earns a commission on completed bookings. Gross booking value is not revenue, and commission is not profit: the host share is passed through, and gateway fees, taxes, refunds and operating costs come out of the commission.
        </p>
        <div className="mt-5">
          <Economics commissionBps={commissionBps} taxBps={taxBps} feeBps={feeBps} />
        </div>
        <p className="mt-3 text-sm text-ink-500">Other revenue lines (installation partnerships, fleet accounts, host insurance) are possibilities to evaluate only once the core booking loop is proven.</p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Competition, honestly</h2>
        <p className="mt-2 text-ink-600">
          {brand.name} is not the first to let private chargers be shared. Public networks already operate in Chennai, and at least one Indian app publicly describes a peer-to-peer model where private charger owners list and earn. The bet here is not the idea itself but its execution: verified safety and permission, reserved slots instead of first-come access, accountable operations, and density in one neighbourhood at a time. Sources and caveats are in the repository&apos;s research notes.
        </p>
      </section>

      <section className="mt-12 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Where an advantage could come from</h2>
          <ul className="mt-3 space-y-2 text-ink-600 [&_li]:ml-5 [&_li]:list-disc">
            <li>Density: enough verified chargers in one neighbourhood that a driver can always find a slot nearby.</li>
            <li>Reliability: reserved slots, host accountability and fast support, rather than first-come queues.</li>
            <li>Trust: a verification process hosts and property managers can point to.</li>
            <li>Data: booking demand by area and hour, useful for deciding where new chargers should be installed.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Expansion logic</h2>
          <ol className="mt-3 space-y-2 text-ink-600 [&_li]:ml-5 [&_li]:list-decimal">
            <li>Prove one dense cluster in Chennai (see the pilot plan in the repository).</li>
            <li>Hit utilisation, completion and host-retention thresholds before adding areas.</li>
            <li>Expand to adjacent neighbourhoods, then to other cities with the same playbook.</li>
          </ol>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">What is real, assumed or simulated</h2>
        <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
          {CLAIMS.map(([claim, label]) => (
            <li key={claim} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <span className="text-sm text-ink-700">{claim}</span>
              <Badge tone={TONE[label]} className="shrink-0 self-start">{label}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-500">
          {brand.name} has no live chargers, customers, revenue or partnerships yet. Regulatory questions (electricity tariffs for resold charging, apartment permissions, insurance) are open and listed in the repository&apos;s research notes.
        </p>
      </section>

      {config.demoMode ? (
        <section id="demo-tour" className="mt-12 scroll-mt-24 rounded-xl border border-ink-200 bg-ink-50 p-6">
          <h2 className="text-xl font-semibold">Explore the demo</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-700">
            <li><strong>Driver:</strong> find a charger on the map, pick a day in the availability strip, reserve, pay (simulated), then view the receipt or cancel.</li>
            <li><strong>Host:</strong> accept the pending request, check earnings and the ledger, or create a new listing and upload evidence.</li>
            <li><strong>Admin:</strong> approve the listing waiting in the verification queue, resolve the disputed booking, review reconciliation and analytics.</li>
          </ol>
          <p className="mt-1 text-sm text-ink-600">Sign in with any of these fictional accounts (password <code className="font-mono font-semibold">{DEMO_PASSWORD}</code>):</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="rounded-lg border border-ink-200 bg-white p-3 text-sm">
                <div className="font-semibold">{a.role}</div>
                <div className="font-mono text-xs text-ink-500">{a.email}</div>
                <div className="mt-1 text-ink-600">{a.note}</div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/login">Sign in to the demo</LinkButton>
            <LinkButton href="/chargers" variant="outline">Browse without an account <ArrowRight className="size-4" aria-hidden /></LinkButton>
          </div>
        </section>
      ) : (
        <div className="mt-12"><Link href="/chargers" className="font-semibold text-volt-700 underline">Find a charger</Link></div>
      )}
    </Container>
  );
}
