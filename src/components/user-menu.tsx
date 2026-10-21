"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";

export function UserMenu({ name, email, isHost, isAdmin }: { name: string; email: string; isHost: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const initials = name.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const links = [
    { href: "/dashboard", label: "My bookings" },
    { href: "/account", label: "Profile & vehicles" },
    { href: isHost ? "/host" : "/host/onboarding", label: isHost ? "Host dashboard" : "Become a host" },
    ...(isHost ? [{ href: "/host/earnings", label: "Earnings" }] : []),
    { href: "/support", label: "Help & support" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin console" }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-xl border border-ink-100 py-1 pl-1 pr-2 hover:bg-ink-50"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-ink-900 text-xs font-bold text-volt-300">{initials || "?"}</span>
        <ChevronDown className="size-4 text-ink-500" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lift">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-ink-500">{email}</div>
          </div>
          <div className="py-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
                {l.label}
              </Link>
            ))}
          </div>
          <form action={signOutAction} className="border-t border-ink-100">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
