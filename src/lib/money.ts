/** All money is integer paise. Display helpers only; never do float maths on stored amounts. */
export function formatINR(paise: number, opts: { decimals?: boolean } = {}) {
  const rupees = paise / 100;
  const decimals = opts.decimals ?? !Number.isInteger(rupees);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(rupees);
}

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

/** Basis-point share of an amount, rounded half-up to the nearest paisa. */
export function bpsOf(amountPaise: number, bps: number) {
  return Math.floor((amountPaise * bps + 5000) / 10000);
}
