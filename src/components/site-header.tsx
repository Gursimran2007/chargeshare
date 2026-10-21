import Link from "next/link";
import { Bell, LayoutDashboard, Shield } from "lucide-react";
import { Logo } from "./domain";
import { Container, LinkButton } from "./ui";
import { UserMenu } from "./user-menu";
import type { Viewer } from "@/lib/auth";

export function SiteHeader({ viewer }: { viewer: Viewer | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="ChargeShare home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Link href="/chargers" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Find a charger
          </Link>
          <Link href={viewer?.isHost ? "/host" : "/host/onboarding"} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            {viewer?.isHost ? "Host dashboard" : "Become a host"}
          </Link>
          <Link href="/how-it-works" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            How it works
          </Link>
          <Link href="/safety" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Safety
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {viewer ? (
            <>
              {viewer.roles.includes("admin") ? (
                <LinkButton href="/admin" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Shield className="size-4" aria-hidden /> Admin
                </LinkButton>
              ) : null}
              <LinkButton href="/dashboard" variant="ghost" size="sm" className="hidden sm:inline-flex">
                <LayoutDashboard className="size-4" aria-hidden /> Trips
              </LinkButton>
              <Link
                href="/notifications"
                className="relative grid size-9 place-items-center rounded-xl text-ink-700 hover:bg-ink-50"
                // The accessible name includes the visible count ("9+") so voice users can say what they see.
                aria-label={viewer.unread ? `Notifications, ${viewer.unread > 9 ? "9+" : viewer.unread} unread` : "Notifications"}
              >
                <Bell className="size-5" aria-hidden />
                {viewer.unread ? (
                  <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-volt-500 px-1 text-[10px] font-bold text-ink-950">
                    {viewer.unread > 9 ? "9+" : viewer.unread}
                  </span>
                ) : null}
              </Link>
              <UserMenu name={viewer.fullName || viewer.email} email={viewer.email} isHost={viewer.isHost} isAdmin={viewer.roles.includes("admin")} />
            </>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/signup" size="sm">
                Sign up
              </LinkButton>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}
