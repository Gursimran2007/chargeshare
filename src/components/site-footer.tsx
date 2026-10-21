import Link from "next/link";
import { Logo } from "./domain";
import { Container } from "./ui";
import { brand } from "@/lib/brand";

export function SiteFooter({ demo }: { demo: boolean }) {
  return (
    <footer className="mt-16 bg-ink-950 text-ink-300">
      <Container className="grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo light />
          <p className="mt-3 text-sm text-ink-400">
            A marketplace for booking existing, safely installed EV chargers. Launching first in {brand.city}.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Drivers</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/chargers" className="hover:text-white">Find a charger</Link></li>
            <li><Link href="/legal/cancellation" className="hover:text-white">Cancellation policy</Link></li>
            <li><Link href="/support" className="hover:text-white">Help & support</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Hosts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/host/onboarding" className="hover:text-white">Become a host</Link></li>
            <li><Link href="/safety" className="hover:text-white">Safety & verification</Link></li>
            <li><Link href="/safety#checklist" className="hover:text-white">Pre-listing checklist</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Company</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/legal/terms" className="hover:text-white">Terms of service</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">Privacy policy</Link></li>
            <li><a href={`mailto:${brand.supportEmail}`} className="hover:text-white">{brand.supportEmail}</a></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-ink-500 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {brand.legalEntity}. Pre-launch product.</span>
          {demo ? <span>Running in demo mode with fictional data and simulated payments.</span> : null}
        </Container>
      </div>
    </footer>
  );
}
