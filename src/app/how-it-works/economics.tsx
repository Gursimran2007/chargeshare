"use client";

import { useState } from "react";
import { quotePrice, estimateContribution } from "@/lib/domain/pricing";
import { formatINR } from "@/lib/money";
import { Input } from "@/components/ui";

/** Interactive unit economics using the same pricing code as the booking engine. */
export function Economics({ commissionBps, taxBps, feeBps }: { commissionBps: number; taxBps: number; feeBps: number }) {
  const [price, setPrice] = useState(150);
  const [hours, setHours] = useState(2);
  const minutes = Math.max(30, Math.round(hours * 2) * 30);
  const q = quotePrice({ pricePerHourPaise: Math.round(price * 100), bookingFeePaise: 0, durationMinutes: minutes, commissionBps });
  const c = estimateContribution({ commissionPaise: q.commissionPaise, taxOnCommissionBps: taxBps, processingFeeBps: feeBps, amountPaise: q.amountPaise });
  const rows: [string, number, string][] = [
    ["Driver pays (gross booking value)", q.amountPaise, "What the driver pays ChargeShare at checkout."],
    ["Host share", q.hostSharePaise, "Owed to the host; a liability until paid out."],
    [`Platform commission (${commissionBps / 100}%)`, q.commissionPaise, "ChargeShare's gross revenue on the booking."],
    [`Est. GST on commission (${taxBps / 100}%)`, -c.taxPaise, "Assumption; confirm treatment with a chartered accountant."],
    [`Est. payment gateway fee (${feeBps / 100}% of GBV)`, -c.processingFeePaise, "Assumption; replace with settlement data."],
    ["Estimated contribution before other costs", c.netContributionPaise, "Excludes support, insurance, refunds absorbed, marketing."],
  ];
  return (
    <div className="rounded-xl border border-ink-200 bg-white">
      <div className="grid gap-4 border-b border-ink-100 p-5 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Host price per hour (₹)</span>
          <Input type="number" min={10} max={5000} step={10} value={price} onChange={(e) => setPrice(Math.max(10, Math.min(5000, Number(e.target.value) || 10)))} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Hours booked</span>
          <Input type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0.5, Math.min(12, Number(e.target.value) || 0.5)))} />
        </label>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-ink-100">
          {rows.map(([label, value, note], i) => (
            <tr key={label} className={i === 0 || i === rows.length - 1 ? "font-semibold" : ""}>
              <td className="px-5 py-3">
                {label}
                <div className="text-xs font-normal text-ink-500">{note}</div>
              </td>
              <td className={`px-5 py-3 text-right tabular-nums ${value < 0 ? "text-ink-500" : ""}`}>{value < 0 ? "−" : ""}{formatINR(Math.abs(value), { decimals: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
        Computed with the booking engine&apos;s own pricing functions and the platform&apos;s current settings. Illustrative only: the 15% commission is a starting assumption, not a validated price point.
      </p>
    </div>
  );
}
