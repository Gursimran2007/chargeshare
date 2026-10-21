import type { ReactNode } from "react";
import { Container } from "./ui";

export function ProsePage({ eyebrow, title, updated, draft, children }: { eyebrow: string; title: string; updated: string; draft?: boolean; children: ReactNode }) {
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <div className="text-xs font-semibold uppercase tracking-wider text-volt-600">{eyebrow}</div>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">Last updated {updated}</p>
      {draft ? (
        <p className="mt-4 rounded-xl border border-warn-600/20 bg-warn-100/60 p-3 text-sm text-ink-700">
          Pre-launch draft. This document has not yet been reviewed by a lawyer and must be finalised before ChargeShare accepts real bookings.
        </p>
      ) : null}
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </Container>
  );
}
