import { AppError } from "@/lib/errors";
import type { Queryable } from "./common";

/**
 * Fixed-window rate limit backed by Postgres, so it holds across server instances.
 * Throws a user-safe error once `limit` hits occur within `windowSeconds`.
 */
export async function rateLimit(q: Queryable, key: string, limit: number, windowSeconds: number) {
  const { rows } = await q.query<{ hits: number }>(
    `insert into internal.rate_limits as r (key, window_start, hits) values ($1, now(), 1)
     on conflict (key) do update set
       hits = case when r.window_start < now() - make_interval(secs => $2) then 1 else r.hits + 1 end,
       window_start = case when r.window_start < now() - make_interval(secs => $2) then now() else r.window_start end
     returning hits`,
    [key, windowSeconds],
  );
  if (rows[0].hits > limit) {
    throw new AppError("rate_limited", "Too many attempts. Please wait a few minutes and try again.");
  }
}
