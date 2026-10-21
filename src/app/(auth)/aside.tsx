import { BadgeCheck, CalendarCheck2, Wallet } from "lucide-react";

export function AuthAside() {
  const items = [
    { icon: BadgeCheck, title: "Checked before listing", body: "Every live charger passes five separate checks, including an electrician's safety report." },
    { icon: CalendarCheck2, title: "Reserved, not first-come", body: "Your slot is held for you. No queues, no arriving to find the charger taken." },
    { icon: Wallet, title: "Clear prices", body: "See the full price before you book. Refunds follow the policy shown at checkout." },
  ];
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-ink-900 p-10 text-white">
      <h2 className="relative max-w-sm text-2xl font-semibold">Charging at someone else&apos;s place, done properly.</h2>
      <ul className="relative mt-10 space-y-7">
        {items.map((i) => (
          <li key={i.title} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-volt-300">
              <i.icon className="size-5" aria-hidden />
            </span>
            <div>
              <div className="font-semibold">{i.title}</div>
              <div className="mt-0.5 text-sm text-ink-300">{i.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
