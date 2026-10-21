export type CancellationPolicy = "flexible" | "moderate" | "strict";
export type Canceller = "driver" | "host" | "admin" | "system";

export const POLICY_TEXT: Record<CancellationPolicy, { title: string; summary: string; rules: string[] }> = {
  flexible: {
    title: "Flexible",
    summary: "Full refund up to 2 hours before the session.",
    rules: ["Cancel 2+ hours before start: 100% refund", "Less than 2 hours before start: 50% refund", "After the start time: no refund"],
  },
  moderate: {
    title: "Moderate",
    summary: "Full refund up to 24 hours before the session.",
    rules: ["Cancel 24+ hours before start: 100% refund", "2 to 24 hours before start: 50% refund", "Less than 2 hours before start: no refund"],
  },
  strict: {
    title: "Strict",
    summary: "50% refund up to 24 hours before the session.",
    rules: ["Cancel 24+ hours before start: 50% refund", "Less than 24 hours before start: no refund"],
  },
};

export interface RefundDecision {
  percent: number;
  refundPaise: number;
  rule: string;
}

/** Refund owed when a confirmed (paid) booking is cancelled. Host or platform cancellations are always refunded in full. */
export function refundForCancellation(
  policy: CancellationPolicy,
  amountPaise: number,
  startAt: Date,
  cancelledAt: Date,
  by: Canceller,
): RefundDecision {
  if (by !== "driver") {
    return { percent: 100, refundPaise: amountPaise, rule: `Cancelled by ${by}: full refund` };
  }
  const hours = (startAt.getTime() - cancelledAt.getTime()) / 3_600_000;
  let percent = 0;
  let rule: string;
  if (policy === "flexible") {
    percent = hours >= 2 ? 100 : hours > 0 ? 50 : 0;
    rule = POLICY_TEXT.flexible.rules[hours >= 2 ? 0 : hours > 0 ? 1 : 2];
  } else if (policy === "moderate") {
    percent = hours >= 24 ? 100 : hours >= 2 ? 50 : 0;
    rule = POLICY_TEXT.moderate.rules[hours >= 24 ? 0 : hours >= 2 ? 1 : 2];
  } else {
    percent = hours >= 24 ? 50 : 0;
    rule = POLICY_TEXT.strict.rules[hours >= 24 ? 0 : 1];
  }
  return { percent, refundPaise: Math.floor((amountPaise * percent) / 100), rule };
}
