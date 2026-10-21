"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Compass, Home, PlugZap, UserRound } from "lucide-react";
import { cn } from "./ui";

export function MobileTabBar({ signedIn, isHost }: { signedIn: boolean; isHost: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/chargers", label: "Explore", icon: Compass },
    { href: signedIn ? "/dashboard" : "/login?next=/dashboard", label: "Trips", icon: CalendarDays, match: "/dashboard" },
    { href: isHost ? "/host" : "/host/onboarding", label: "Host", icon: PlugZap, match: "/host" },
    { href: signedIn ? "/account" : "/login", label: signedIn ? "Account" : "Sign in", icon: UserRound, match: "/account" },
  ];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.match ?? t.href);
          return (
            <li key={t.label}>
              <Link href={t.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-volt-600" : "text-ink-500")}>
                <t.icon className="size-5" aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
