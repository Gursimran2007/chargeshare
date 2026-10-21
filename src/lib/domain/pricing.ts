import { bpsOf } from "@/lib/money";

export interface PriceInput {
  pricePerHourPaise: number;
  bookingFeePaise: number;
  durationMinutes: number;
  commissionBps: number;
}

export interface PriceQuote {
  durationMinutes: number;
  chargingPaise: number;
  bookingFeePaise: number;
  /** What the driver pays. */
  amountPaise: number;
  commissionBps: number;
  /** Platform gross commission (before gateway fees, taxes, refunds). */
  commissionPaise: number;
  /** Host share before payouts / adjustments. */
  hostSharePaise: number;
}

/** Server-side price calculation. The only source of truth for booking amounts. */
export function quotePrice(i: PriceInput): PriceQuote {
  if (!Number.isInteger(i.durationMinutes) || i.durationMinutes <= 0) throw new Error("invalid duration");
  if (i.commissionBps < 0 || i.commissionBps > 5000) throw new Error("invalid commission");
  const chargingPaise = Math.round((i.pricePerHourPaise * i.durationMinutes) / 60);
  const amountPaise = chargingPaise + i.bookingFeePaise;
  const commissionPaise = bpsOf(amountPaise, i.commissionBps);
  return {
    durationMinutes: i.durationMinutes,
    chargingPaise,
    bookingFeePaise: i.bookingFeePaise,
    amountPaise,
    commissionBps: i.commissionBps,
    commissionPaise,
    hostSharePaise: amountPaise - commissionPaise,
  };
}

export interface ContributionInput {
  commissionPaise: number;
  taxOnCommissionBps: number;
  processingFeeBps: number;
  amountPaise: number;
}

/** Platform contribution is NOT the commission: gateway fees and taxes come out of it. */
export function estimateContribution(i: ContributionInput) {
  const taxPaise = bpsOf(i.commissionPaise, i.taxOnCommissionBps);
  const processingFeePaise = bpsOf(i.amountPaise, i.processingFeeBps);
  return {
    taxPaise,
    processingFeePaise,
    netContributionPaise: i.commissionPaise - taxPaise - processingFeePaise,
  };
}
