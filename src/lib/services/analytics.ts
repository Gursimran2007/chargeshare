import type { Queryable } from "./common";

export type AnalyticsEvent = "search" | "listing_view" | "checkout_view" | "booking_request" | "signup";

/** Records a product event. Never throws: analytics must not break a user journey. */
export async function track(
  q: Queryable,
  event: AnalyticsEvent,
  e: { visitorId?: string | null; userId?: string | null; listingId?: string | null; bookingId?: string | null; props?: Record<string, unknown>; isDemo: boolean },
) {
  try {
    await q.query(
      `insert into public.analytics_events (event, visitor_id, user_id, listing_id, booking_id, props, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [event, e.visitorId ?? null, e.userId ?? null, e.listingId ?? null, e.bookingId ?? null, JSON.stringify(e.props ?? {}), e.isDemo],
    );
  } catch (err) {
    console.error("[analytics]", err);
  }
}
