-- Abuse protection and product analytics.

-- Fixed-window rate limiting shared by every app instance. Lives in the
-- internal schema, which end users cannot reach through the API.
create schema if not exists internal;
create table internal.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 1
);

-- First-party product events for funnel metrics (search -> listing -> booking).
-- No personal data beyond the user id; visitor ids are random first-party cookies.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('search', 'listing_view', 'checkout_view', 'booking_request', 'signup')),
  visitor_id text,
  user_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.charger_listings(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index analytics_events_event_idx on public.analytics_events(event, created_at desc);

alter table public.analytics_events enable row level security;
create policy analytics_admin_read on public.analytics_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.analytics_events from anon, authenticated;
