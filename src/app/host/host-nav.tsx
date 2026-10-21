"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/host", label: "Overview" },
  { href: "/host/bookings", label: "Bookings & calendar" },
  { href: "/host/earnings", label: "Earnings" },
  { href: "/host/onboarding", label: "Profile & safety" },
];

export function HostNav() {
  const path = usePathname();
  return (
    <nav aria-label="Host" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-ink-100 px-4 sm:mx-0 sm:px-0">
      {LINKS.map((l) => {
        const active = l.href === "/host" ? path === "/host" || path.startsWith("/host/listings") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-volt-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
