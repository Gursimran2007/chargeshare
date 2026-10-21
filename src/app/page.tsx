import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  IndianRupee,
  MapPinned,
  Plug,
  Search,
  ShieldCheck,
  UserCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { Container, LinkButton, Badge } from "@/components/ui";
import { ListingCard } from "@/components/domain";
import { getDb } from "@/lib/db";
import { searchListings } from "@/lib/services/listings";
import { brand } from "@/lib/brand";
import { config } from "@/lib/config";

function HeroVisual() {
  const pins = [
    { x: 118, y: 92, p: "₹120" },
    { x: 256, y: 150, p: "₹220" },
    { x: 182, y: 236, p: "₹70" },
    { x: 330, y: 268, p: "₹150" },
    { x: 92, y: 300, p: "₹110" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-6 rounded-[40px] bg-volt-500/20 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-ink-800 shadow-2xl">
        <svg viewBox="0 0 440 400" className="block w-full" role="img" aria-label="Illustrated map with charger pins">
          <rect width="440" height="400" fill="#0d1d38" />
          <path d="M300 0c-20 60 30 90 10 150s40 110 20 170 30 60 30 80h80V0Z" fill="#0f2c4a" />
          <g stroke="#1c3358" strokeWidth="10" fill="none" strokeLinecap="round">
            <path d="M-10 120 C 100 140, 180 90, 300 130" />
            <path d="M60 -10 C 80 120, 140 220, 120 410" />
            <path d="M-10 330 C 120 300, 220 340, 330 300" />
            <path d="M200 -10 C 210 120, 260 220, 250 410" />
          </g>
          <g stroke="#2a4570" strokeWidth="3" fill="none" opacity="0.7">
            <path d="M0 210 L 300 200" />
            <path d="M150 0 L 170 400" />
            <path d="M0 50 L 280 70" />
          </g>
          {pins.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              {i === 1 ? <circle r="22" fill="#2fd3c9" opacity="0.18" /> : null}
              <rect x="-30" y="-14" width="60" height="28" rx="14" fill={i === 1 ? "#0fb5ae" : "#ffffff"} />
              <circle cx="-17" cy="0" r="4" fill={i === 1 ? "#ffffff" : "#0fb5ae"} />
              <text x="6" y="5" textAnchor="middle" fontSize="13" fontWeight="700" fill={i === 1 ? "#050d1c" : "#0a1730"} fontFamily="system-ui, sans-serif">
                {p.p}
              </text>
            </g>
          ))}
          <circle cx="210" cy="190" r="7" fill="#22c55e" stroke="#fff" strokeWidth="3" />
        </svg>
        <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white p-4 shadow-lift">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-volt-600">Example slot</div>
              <div className="mt-0.5 font-display text-base font-semibold text-ink-900">Hotel forecourt · 22 kW Type 2</div>
              <div className="text-sm text-ink-500">Today, 6:00 – 8:00 pm · Nungambakkam</div>
            </div>
            <Badge tone="go">
              <span className="size-1.5 rounded-full bg-go-500" /> Open
            </Badge>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-sm">
            <span className="text-ink-500">2 hours · price shown before you pay</span>
            <span className="font-semibold text-ink-900">₹440</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-400">Illustration. Listings shown in this build are fictional demo data.</p>
    </div>
  );
}

const FAQ = [
  {
    q: "Is ChargeShare live?",
    a: `Not yet. ${brand.name} is preparing to launch in ${brand.city}. Every listing you see in this build is a fictional demo listing, and payments are simulated.`,
  },
  {
    q: "How do you decide a charger is safe to list?",
    a: "Each listing must pass five separate checks reviewed by our team: host identity, permission to use the parking space, the charger's specification, installation evidence, and an electrical safety report from a qualified electrician. Until all five are approved, the listing cannot go live.",
  },
  {
    q: "Can I list an ordinary wall socket?",
    a: "No. Only certified EV chargers (EVSE) installed on an appropriate circuit can be listed. Household sockets are not accepted.",
  },
  {
    q: "Will the charger work with my car?",
    a: "Add your vehicle and we only let you book chargers whose connector your vehicle supports. We also show the power your car is likely to draw. Actual speed depends on your vehicle, battery state, temperature and the charger.",
  },
  {
    q: "Do you show the charger's live status?",
    a: "No. Listings use availability set by the host and bookings made on ChargeShare. We do not currently connect to chargers, meter energy or control them remotely. Sessions are confirmed by the host.",
  },
  {
    q: "What happens if I cancel?",
    a: "Each listing shows its cancellation policy (Flexible, Moderate or Strict) before you pay, and refunds are calculated automatically from it. If a host cancels, you get a full refund.",
  },
  {
    q: "How do hosts get paid?",
    a: "After a session is completed, the host's share (the booking amount minus the platform commission) becomes eligible for payout. Payouts are reviewed and sent by our team while we set up automated payouts.",
  },
];

export default async function Home() {
  const db = await getDb();
  const listings = (await searchListings(db, {})).slice(0, 6);
  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_20%,rgba(15,181,174,0.22),transparent),radial-gradient(40%_50%_at_10%_90%,rgba(34,197,94,0.12),transparent)]" aria-hidden />
        <Container className="relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <Badge tone="outline" className="border-white/15 bg-white/5 text-ink-200">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-volt-400" />
              </span>
              Preparing to launch in {brand.city}
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              Your next charge is <span className="text-volt-400">closer</span> than you think.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-300">
              Discover and book verified EV chargers near homes, workplaces, and destinations. Already own a charger? Put it to work and earn from available charging time.
            </p>
            <form action="/chargers" className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 sm:flex-row">
              <label htmlFor="hero-q" className="sr-only">Area or locality</label>
              <div className="flex flex-1 items-center gap-2 px-3">
                <Search className="size-5 text-ink-400" aria-hidden />
                <input id="hero-q" name="q" placeholder="Try Adyar, OMR or T. Nagar" className="h-11 w-full bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none" />
              </div>
              <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-volt-500 px-5 font-semibold text-ink-950 hover:bg-volt-400">
                Find a charger <ArrowRight className="size-4" aria-hidden />
              </button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-400">
              <Link href="/host/onboarding" className="inline-flex items-center gap-1 font-semibold text-white hover:text-volt-300">
                Become a host <ArrowRight className="size-4" aria-hidden />
              </Link>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-volt-400" aria-hidden /> Five checks before any charger goes live</span>
            </div>
          </div>
          <HeroVisual />
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-volt-600">How it works</div>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Book a charger in three steps</h2>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { icon: MapPinned, t: "Find a compatible charger", b: "Filter by connector, power, price and access. We hide chargers your car can't use." },
              { icon: CalendarClock, t: "Reserve your slot", b: "Pick a time and duration. The full price, and how much charge to expect, is shown upfront." },
              { icon: Plug, t: "Arrive and charge", b: "The exact address and access instructions unlock once your booking is confirmed." },
            ].map((s, i) => (
              <li key={s.t} className="relative rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-ink-900 text-volt-300"><s.icon className="size-5" aria-hidden /></span>
                  <span className="font-display text-sm font-semibold text-ink-400">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-ink-500">{s.b}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="bg-ink-50 py-16 sm:py-20">
        <Container className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-8 shadow-card">
            <Badge tone="volt">For drivers</Badge>
            <h2 className="mt-4 text-2xl font-semibold">Charge where you&apos;re already going</h2>
            <ul className="mt-6 space-y-4">
              {[
                { icon: Zap, t: "Compatibility first", b: "Bookings are only possible on chargers your vehicle profile supports." },
                { icon: IndianRupee, t: "One clear price", b: "Hourly price plus any listed fee. No surprises after the session." },
                { icon: CalendarClock, t: "A reserved slot", b: "Your time is held for you, with buffer time between bookings." },
              ].map((x) => (
                <li key={x.t} className="flex gap-3">
                  <x.icon className="mt-0.5 size-5 shrink-0 text-volt-600" aria-hidden />
                  <div><div className="font-semibold">{x.t}</div><div className="text-sm text-ink-500">{x.b}</div></div>
                </li>
              ))}
            </ul>
            <LinkButton href="/chargers" className="mt-8">Find a charger</LinkButton>
          </div>
          <div className="rounded-3xl bg-ink-900 p-8 text-white shadow-card">
            <Badge tone="outline" className="border-white/15 bg-white/5 text-volt-300">For hosts</Badge>
            <h2 className="mt-4 text-2xl font-semibold">Put an idle charger to work</h2>
            <ul className="mt-6 space-y-4">
              {[
                { icon: CalendarClock, t: "You set the rules", b: "Hours, price, minimum booking, buffer time, and instant or request-to-book." },
                { icon: Wallet, t: "Transparent earnings", b: "See every booking's amount, the 15% platform commission, refunds and your payouts." },
                { icon: ShieldCheck, t: "Verified drivers, private address", b: "Your exact address is only shared with confirmed bookings." },
              ].map((x) => (
                <li key={x.t} className="flex gap-3">
                  <x.icon className="mt-0.5 size-5 shrink-0 text-volt-400" aria-hidden />
                  <div><div className="font-semibold">{x.t}</div><div className="text-sm text-ink-300">{x.b}</div></div>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-white/5 p-3 text-sm text-ink-300">
              Example: a ₹300 booking earns the host ₹255 before payout. ChargeShare&apos;s gross commission is ₹45, from which payment fees and taxes are paid.
            </p>
            <LinkButton href="/host/onboarding" variant="volt" className="mt-6">Become a host</LinkButton>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-volt-600">Preview</div>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Chargers around {brand.city}</h2>
              {config.demoMode ? (
                <p className="mt-2 max-w-2xl text-sm text-ink-500">
                  These are fictional demo listings for exploring the product. They are not real chargers and are not available to book in the real world.
                </p>
              ) : null}
            </div>
            <LinkButton href="/chargers" variant="outline">Open the map <ArrowRight className="size-4" aria-hidden /></LinkButton>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-ink-950 py-16 text-white sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-volt-400">Safety & verification</div>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">A badge means something here</h2>
            <p className="mt-4 text-ink-300">
              We never mark a charger as verified because someone signed up or uploaded a photo. Each check is reviewed separately, has a decision date, and can be suspended if something changes.
            </p>
            <LinkButton href="/safety" variant="volt" className="mt-6">Read our safety standards</LinkButton>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: UserCheck, t: "Identity", b: "Government ID or business registration matches the host account." },
              { icon: FileCheck2, t: "Property permission", b: "Ownership, lease or an RWA / property manager NOC." },
              { icon: Plug, t: "Charger specification", b: "Rating plate and invoice match the connector and kW listed." },
              { icon: ClipboardCheck, t: "Installation", b: "Fixed EVSE on a dedicated circuit, with installer evidence." },
              { icon: BadgeCheck, t: "Electrical safety", b: "Inspection report from a licensed electrical contractor." },
            ].map((c) => (
              <li key={c.t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <c.icon className="size-5 text-volt-400" aria-hidden />
                <div className="mt-3 font-semibold">{c.t}</div>
                <div className="mt-1 text-sm text-ink-400">{c.b}</div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="py-16 sm:py-20" id="faq">
        <Container className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="text-3xl font-semibold sm:text-4xl">Questions, answered</h2>
            <p className="mt-3 text-ink-500">
              Something else? Email <a className="font-medium text-volt-700 underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
            </p>
          </div>
          <div className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                  {f.q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-50 text-ink-500 transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
