import Link from "next/link";
import { Logo } from "@/components/domain";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:py-16 lg:grid-cols-2 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-8 inline-block lg:hidden">
          <Logo />
        </Link>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
      <div className="hidden lg:block">{aside}</div>
    </div>
  );
}
