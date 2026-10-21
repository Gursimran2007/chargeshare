"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  ["/admin", "Analytics"],
  ["/admin/verifications", "Verification queue"],
  ["/admin/listings", "Listings"],
  ["/admin/bookings", "Bookings & disputes"],
  ["/admin/payouts", "Payouts"],
  ["/admin/users", "Users"],
  ["/admin/support", "Support & incidents"],
  ["/admin/reviews", "Reviews"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Audit log"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-ink-100 px-4 sm:mx-0 sm:px-0">
      {LINKS.map(([href, label]) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-volt-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
