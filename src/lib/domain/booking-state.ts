export type BookingStatus =
  | "requested"
  | "declined"
  | "pending_payment"
  | "expired"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "disputed"
  | "refunded";

/** Statuses that occupy the charger (mirrors the DB exclusion constraint). */
export const ACTIVE_STATUSES: BookingStatus[] = ["requested", "pending_payment", "confirmed", "checked_in", "in_progress"];

export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["pending_payment", "declined", "cancelled", "expired"],
  pending_payment: ["confirmed", "cancelled", "expired"],
  confirmed: ["checked_in", "in_progress", "cancelled", "disputed"],
  checked_in: ["in_progress", "completed", "disputed", "cancelled"],
  in_progress: ["completed", "disputed"],
  completed: ["disputed"],
  disputed: ["completed", "refunded"],
  declined: [],
  expired: [],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return TRANSITIONS[from].includes(to);
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Awaiting host",
  declined: "Declined",
  pending_payment: "Awaiting payment",
  expired: "Expired",
  confirmed: "Confirmed",
  checked_in: "Driver arrived",
  in_progress: "Charging",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
  refunded: "Refunded",
};
