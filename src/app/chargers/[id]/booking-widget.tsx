"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, BatteryCharging, CheckCircle2, Info, Loader2 } from "lucide-react";
import { bookAction, calendarAction, quoteAction, slotsAction } from "./actions";
import { Card, Select, Input, Badge, cn, LinkButton } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/domain/time";

interface Vehicle {
  id: string;
  label: string;
}

type Quote = Extract<Awaited<ReturnType<typeof quoteAction>>, { ok: true }>["quote"];

export function BookingWidget({
  listingId,
  pricePerHourPaise,
  bookingFeePaise,
  minMinutes,
  maxMinutes,
  instantBook,
  vehicles,
  signedIn,
  isOwnListing,
  today,
}: {
  listingId: string;
  pricePerHourPaise: number;
  bookingFeePaise: number;
  minMinutes: number;
  maxMinutes: number;
  instantBook: boolean;
  vehicles: Vehicle[];
  signedIn: boolean;
  isOwnListing: boolean;
  today: string;
}) {
  const durations = useMemo(() => {
    const out: number[] = [];
    for (let m = minMinutes; m <= maxMinutes; m += 30) out.push(m);
    return out;
  }, [minMinutes, maxMinutes]);
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(durations[0]);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [latestQuote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [quoting, startQuote] = useTransition();
  const [state, action] = useActionState(bookAction, null);
  const [calendar, setCalendar] = useState<Awaited<ReturnType<typeof calendarAction>> | null>(null);

  useEffect(() => {
    let live = true;
    calendarAction(listingId, duration).then((c) => live && setCalendar(c));
    return () => {
      live = false;
    };
  }, [listingId, duration]);

  useEffect(() => {
    startSlots(async () => {
      const s = await slotsAction(listingId, date, duration);
      setSlots(s);
      setTime((t) => (s.includes(t) ? t : (s[0] ?? "")));
    });
  }, [listingId, date, duration]);

  useEffect(() => {
    if (!time) return;
    startQuote(async () => {
      const r = await quoteAction({ listingId, date, startTime: time, durationMinutes: duration, vehicleId: vehicleId || null });
      if (r.ok) {
        setQuote(r.quote);
        setQuoteError(null);
      } else {
        setQuote(null);
        setQuoteError(r.message);
      }
    });
  }, [listingId, date, time, duration, vehicleId]);

  // A quote is only meaningful while a start time is selected.
  const quote = time ? latestQuote : null;
  const compat = quote?.compatibility;
  const canBook = signedIn && !isOwnListing && !!vehicleId && !!quote && !quote.problem && compat?.compatible;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-display text-2xl font-semibold">{formatINR(pricePerHourPaise)}</span>
          <span className="text-sm text-ink-500"> / hour</span>
        </div>
        <Badge tone={instantBook ? "volt" : "warn"}>{instantBook ? "Instant book" : "Request to book"}</Badge>
      </div>
      {bookingFeePaise > 0 ? <p className="mt-1 text-xs text-ink-500">+ {formatINR(bookingFeePaise)} booking fee set by the host</p> : null}

      <form action={action} className="mt-5 space-y-3">
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="startTime" value={time} />
        <FormMessage state={state} />
        {/* min-w-0: fieldsets default to min-content width, which would let the strip widen the page */}
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-medium text-ink-600">Next 14 days</legend>
          {calendar ? (
            <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
              {calendar.map((d) => {
                const day = new Date(`${d.date}T12:00:00Z`);
                const selected = d.date === date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDate(d.date)}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-12 shrink-0 snap-start flex-col items-center rounded-lg border py-1.5 text-xs",
                      selected ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-800 hover:border-ink-400",
                      !d.open && !selected && "bg-ink-50 text-ink-500",
                    )}
                  >
                    {/* Accessible name = visible "Wed 22" + screen-reader-only month and availability. */}
                    <span className="font-medium">{new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(day)} </span>
                    <span className="text-sm font-semibold tabular-nums">{day.getUTCDate()}</span>
                    <span className="sr-only">
                      {" "}{new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(day)}, {d.closed ? "closed" : d.open ? `${d.open} start times` : "fully booked"}
                    </span>
                    <span aria-hidden className={cn("mt-0.5 size-1.5 rounded-full", d.open ? (selected ? "bg-volt-300" : "bg-go-500") : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="skeleton h-14 rounded-lg" />
          )}
          <p className="mt-1 text-[11px] text-ink-500">Green dot: open slots for the selected duration.</p>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="bw-date" className="mb-1 block text-xs font-medium text-ink-600">Date</label>
            <Input id="bw-date" name="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="bw-dur" className="mb-1 block text-xs font-medium text-ink-600">Duration</label>
            <Select id="bw-dur" name="durationMinutes" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {durations.map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " 30 min" : ""}` : `${m} min`}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink-600">Start time</legend>
          {loadingSlots && slots === null ? (
            <div className="flex h-10 items-center gap-2 text-sm text-ink-500"><Loader2 className="size-4 animate-spin" /> Checking availability…</div>
          ) : slots && slots.length ? (
            <div className={cn("flex max-h-36 flex-wrap gap-1.5 overflow-y-auto", loadingSlots && "opacity-60")}>
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTime(s)}
                  aria-pressed={time === s}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-sm font-medium tabular-nums",
                    time === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-800 hover:border-ink-400",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-sm text-ink-600">No open slots for this date and duration. Try another day or a shorter session.</p>
          )}
        </fieldset>
        {signedIn ? (
          vehicles.length ? (
            <div>
              <label htmlFor="bw-vehicle" className="mb-1 block text-xs font-medium text-ink-600">Vehicle</label>
              <Select id="bw-vehicle" name="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
            </div>
          ) : (
            <div className="rounded-xl border border-warn-600/20 bg-warn-100/60 p-3 text-sm text-ink-700">
              Add your vehicle so we can check it works with this charger.{" "}
              <Link href={`/account?next=/chargers/${listingId}`} className="font-semibold text-volt-700 underline">Add vehicle</Link>
            </div>
          )
        ) : null}
        <div>
          <label htmlFor="bw-note" className="mb-1 block text-xs font-medium text-ink-600">Note to host (optional)</label>
          <Input id="bw-note" name="note" maxLength={500} placeholder="e.g. arriving from OMR" />
        </div>

        {quoting && !quote ? <div className="skeleton h-28 rounded-xl" /> : null}
        {quote ? (
          <div className={cn("space-y-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4 text-sm", quoting && "opacity-60")}>
            <div className="text-xs text-ink-500">{formatDateTime(quote.start)} – {formatDateTime(quote.end).split(", ").pop()}</div>
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-ink-600">{formatINR(pricePerHourPaise)} × {duration / 60} h</dt><dd>{formatINR(quote.price.chargingPaise, { decimals: true })}</dd></div>
              {quote.price.bookingFeePaise ? <div className="flex justify-between"><dt className="text-ink-600">Booking fee</dt><dd>{formatINR(quote.price.bookingFeePaise)}</dd></div> : null}
              <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold"><dt>Total</dt><dd>{formatINR(quote.price.amountPaise, { decimals: true })}</dd></div>
            </dl>
            {quote.problem ? (
              <p className="flex gap-2 text-stop-600"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {quote.problem}</p>
            ) : null}
            {compat ? (
              compat.compatible ? (
                <div className="space-y-1.5">
                  <p className="flex gap-2 text-go-600"><CheckCircle2 className="size-4 shrink-0" aria-hidden /> Compatible with your vehicle</p>
                  {quote.estimate ? (
                    <p className="flex gap-2 text-ink-700">
                      <BatteryCharging className="size-4 shrink-0 text-volt-600" aria-hidden />
                      About {quote.estimate.energyKwh} kWh
                      {quote.estimate.percentAdded !== null ? ` (~${quote.estimate.percentAdded}% of your battery from 20%)` : ""} at ~{compat.effectiveKw} kW.
                    </p>
                  ) : null}
                  {compat.reasons.map((r) => <p key={r} className="flex gap-2 text-xs text-ink-500"><Info className="size-3.5 shrink-0" aria-hidden /> {r}</p>)}
                  <p className="text-xs text-ink-500">Estimates only. Actual charging depends on your vehicle, battery state, temperature and the charger.</p>
                </div>
              ) : (
                <p className="flex gap-2 text-stop-600"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {compat.reasons[0]}</p>
              )
            ) : null}
          </div>
        ) : quoteError ? <p className="text-sm text-stop-600">{quoteError}</p> : null}

        {isOwnListing ? (
          <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">This is your listing. Drivers book it from here.</p>
        ) : signedIn ? (
          <SubmitButton className="w-full" size="lg" disabled={!canBook} pendingText="Reserving…">
            {instantBook ? "Reserve and pay" : "Send booking request"}
          </SubmitButton>
        ) : (
          <LinkButton href={`/login?next=/chargers/${listingId}`} className="w-full" size="lg">Sign in to book</LinkButton>
        )}
        <p className="text-center text-xs text-ink-500">
          {instantBook
            ? "Your slot is held for 15 minutes while you pay."
            : "You won't be charged unless the host accepts."}
        </p>
      </form>
    </Card>
  );
}
