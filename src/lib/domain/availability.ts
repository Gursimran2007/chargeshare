import { hhmmToMinutes, zonedParts, zonedToUtc, minutesToHHMM } from "./time";

export interface AvailabilityRule {
  weekday: number;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotPolicy {
  timeZone: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferMinutes: number;
  advanceNoticeMinutes: number;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Validate a requested slot against the listing's weekly hours, blocked times
 * and existing bookings (already expanded by their buffers). Returns a
 * user-facing reason, or null when the slot is bookable.
 *
 * This runs on the server inside the booking transaction; the database
 * exclusion constraint is the final guard against races.
 */
export function slotProblem(
  slot: Interval,
  policy: SlotPolicy,
  rules: AvailabilityRule[],
  blocked: Interval[],
  busy: Interval[],
  now: Date,
): string | null {
  const minutes = Math.round((slot.end.getTime() - slot.start.getTime()) / 60000);
  if (minutes % 30 !== 0) return "Bookings are made in 30-minute steps.";
  if (minutes < policy.minDurationMinutes) return `The minimum booking here is ${policy.minDurationMinutes} minutes.`;
  if (minutes > policy.maxDurationMinutes) return `The maximum booking here is ${policy.maxDurationMinutes} minutes.`;
  if (slot.start.getTime() < now.getTime() + policy.advanceNoticeMinutes * 60000) {
    return policy.advanceNoticeMinutes > 0
      ? `This host needs at least ${policy.advanceNoticeMinutes} minutes' notice.`
      : "That time has already passed.";
  }
  const s = zonedParts(slot.start, policy.timeZone);
  const e = zonedParts(new Date(slot.end.getTime() - 1), policy.timeZone);
  if (s.day !== e.day) return "Bookings cannot run past midnight.";
  const endMinutes = s.minutes + minutes;
  const inHours = rules.some(
    (r) => r.weekday === s.weekday && hhmmToMinutes(r.start_time) <= s.minutes && endMinutes <= hhmmToMinutes(r.end_time),
  );
  if (!inHours) return "That time is outside the host's charging hours.";
  const withBuffer: Interval = { start: slot.start, end: new Date(slot.end.getTime() + policy.bufferMinutes * 60000) };
  if (blocked.some((b) => overlaps(withBuffer, b))) return "The host has blocked that time.";
  if (busy.some((b) => overlaps(withBuffer, b))) return "That slot overlaps another booking.";
  return null;
}

/** Start times (HH:MM, local) on a date where a booking of `durationMinutes` fits. */
export function availableStartTimes(
  date: string,
  durationMinutes: number,
  policy: SlotPolicy,
  rules: AvailabilityRule[],
  blocked: Interval[],
  busy: Interval[],
  now: Date,
): string[] {
  const out: string[] = [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  for (const r of rules.filter((x) => x.weekday === weekday)) {
    for (let m = hhmmToMinutes(r.start_time); m + durationMinutes <= hhmmToMinutes(r.end_time); m += 30) {
      const start = zonedToUtc(date, minutesToHHMM(m), policy.timeZone);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      if (!slotProblem({ start, end }, policy, rules, blocked, busy, now)) out.push(minutesToHHMM(m));
    }
  }
  return [...new Set(out)].sort();
}
