-- Follow-up markers so maintenance jobs act exactly once per booking.
alter table public.bookings
  add column host_reminded_at timestamptz,   -- host nudged about an unanswered request
  add column escalated_at timestamptz;       -- slot ended without the host confirming the outcome

create index bookings_followup_idx on public.bookings(status, end_at) where escalated_at is null;
