-- ChargeShare core schema.
-- Money is stored as integer paise. Timestamps are timestamptz (UTC);
-- availability rules are interpreted in the listing's time zone (Asia/Kolkata).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type app_role as enum ('driver', 'host', 'admin');
create type host_type as enum ('homeowner', 'apartment', 'office', 'hotel', 'retail', 'other');
create type current_type as enum ('AC', 'DC');
create type verification_status as enum (
  'not_submitted', 'pending_review', 'needs_info', 'verified', 'rejected', 'suspended'
);
create type verification_check as enum (
  'identity', 'property_permission', 'charger_spec', 'installation_evidence', 'electrical_safety'
);
create type listing_status as enum (
  'draft', 'pending_review', 'changes_requested', 'active', 'paused', 'rejected', 'suspended'
);
create type access_type as enum (
  'private_driveway', 'gated_community', 'office_parking', 'hotel_parking', 'retail_parking', 'public_lot'
);
create type cancellation_policy as enum ('flexible', 'moderate', 'strict');
create type booking_status as enum (
  'requested', 'declined', 'pending_payment', 'expired', 'confirmed', 'checked_in',
  'in_progress', 'completed', 'cancelled', 'disputed', 'refunded'
);
create type payment_status as enum ('created', 'captured', 'failed', 'refunded', 'partially_refunded');
create type refund_status as enum ('pending', 'processed', 'failed');
create type payout_status as enum ('pending', 'processing', 'paid', 'failed');
create type ledger_entry_type as enum (
  'booking_gross',        -- what the driver paid
  'host_share',           -- owed to the host (liability until paid out)
  'platform_commission',  -- platform gross commission
  'tax_on_commission',    -- estimated GST on commission (liability)
  'processing_fee',       -- payment gateway fee (estimate in demo mode)
  'refund',               -- money returned to the driver
  'payout'                -- money paid out to the host
);
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type report_status as enum ('open', 'investigating', 'actioned', 'dismissed');
create type report_severity as enum ('low', 'medium', 'high', 'critical');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity, roles, permissions
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{8,16}$'),
  city text not null default 'Chennai',
  avatar_url text,
  is_restricted boolean not null default false,
  restricted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id),
  primary key (user_id, role)
);

create table public.role_permissions (
  role app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission) values
  ('driver', 'booking.create'), ('driver', 'booking.cancel_own'), ('driver', 'review.create'),
  ('driver', 'vehicle.manage_own'), ('driver', 'support.create'),
  ('host', 'listing.manage_own'), ('host', 'booking.manage_own_listings'),
  ('host', 'verification.submit_own'), ('host', 'earnings.view_own'),
  ('admin', 'verification.review'), ('admin', 'listing.moderate'), ('admin', 'booking.oversee'),
  ('admin', 'refund.issue'), ('admin', 'payout.manage'), ('admin', 'settings.manage'),
  ('admin', 'user.restrict'), ('admin', 'audit.view'), ('admin', 'analytics.view');

-- New auth user -> profile + default driver role (same pattern as Supabase docs).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'driver');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin')
$$;

-- True when the current DB session is a trusted server context rather than an
-- end-user JWT (service connection or Supabase service_role).
create or replace function public.is_trusted_context() returns boolean
language sql stable as $$
  select current_user not in ('anon', 'authenticated')
$$;

-- ---------------------------------------------------------------------------
-- Reference data: connectors and vehicle catalogue (configurable)
-- ---------------------------------------------------------------------------
create table public.connector_types (
  code text primary key,
  label text not null,
  current current_type not null,
  description text not null default '',
  max_kw numeric(6,1) not null check (max_kw > 0),
  -- Only connector categories that pass platform safety rules may be listed.
  listable boolean not null default true,
  sort_order int not null default 0
);

create table public.vehicle_models (
  id text primary key,
  make text not null,
  model text not null,
  battery_kwh numeric(6,1) check (battery_kwh is null or battery_kwh > 0),
  max_ac_kw numeric(5,1) check (max_ac_kw is null or max_ac_kw > 0),
  max_dc_kw numeric(6,1),
  connectors text[] not null default '{}',
  notes text not null default ''
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  model_id text references public.vehicle_models(id),
  nickname text not null default '' check (char_length(nickname) <= 60),
  make text not null check (char_length(make) between 1 and 60),
  model text not null check (char_length(model) between 1 and 60),
  battery_kwh numeric(6,1) check (battery_kwh is null or (battery_kwh > 0 and battery_kwh < 300)),
  max_ac_kw numeric(5,1) check (max_ac_kw is null or (max_ac_kw > 0 and max_ac_kw <= 50)),
  connectors text[] not null check (cardinality(connectors) > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index vehicles_owner_idx on public.vehicles(owner_id);
create unique index vehicles_one_default on public.vehicles(owner_id) where is_default;

-- ---------------------------------------------------------------------------
-- Hosts & listings
-- ---------------------------------------------------------------------------
create table public.host_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  host_type host_type not null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  contact_phone text, -- private: never shown to drivers
  payout_upi_masked text, -- display only; real payout details belong with the payment provider
  safety_checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger host_profiles_touch before update on public.host_profiles
  for each row execute function public.touch_updated_at();

create table public.charger_listings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host_profiles(user_id) on delete restrict,
  status listing_status not null default 'draft',
  is_demo boolean not null default false,
  title text not null check (char_length(title) between 6 and 90),
  description text not null default '' check (char_length(description) <= 2000),
  property_type host_type not null,
  connector_type text not null references public.connector_types(code),
  charger_make text not null default '',
  charger_model text not null default '',
  rated_power_kw numeric(5,1) not null check (rated_power_kw > 0 and rated_power_kw <= 350),
  -- Private location (released only to confirmed bookings / admins)
  address_line text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  access_instructions text not null default '',
  -- Public, approximate location
  locality text not null,
  city text not null default 'Chennai',
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  approx_lat double precision not null,
  approx_lng double precision not null,
  timezone text not null default 'Asia/Kolkata',
  access_type access_type not null,
  parking_details text not null default '',
  restrictions text not null default '',
  amenities text[] not null default '{}',
  supported_vehicle_notes text not null default '',
  price_per_hour_paise integer not null check (price_per_hour_paise between 1000 and 500000),
  booking_fee_paise integer not null default 0 check (booking_fee_paise between 0 and 50000),
  min_duration_minutes integer not null default 60 check (min_duration_minutes between 30 and 720),
  max_duration_minutes integer not null default 240 check (max_duration_minutes between 30 and 1440),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 120),
  advance_notice_minutes integer not null default 60 check (advance_notice_minutes between 0 and 2880),
  cancellation_policy cancellation_policy not null default 'moderate',
  instant_book boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  rejection_reason text,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_duration_minutes >= min_duration_minutes)
);
create index listings_status_idx on public.charger_listings(status);
create index listings_host_idx on public.charger_listings(host_id);
create index listings_geo_idx on public.charger_listings(approx_lat, approx_lng);
create trigger listings_touch before update on public.charger_listings
  for each row execute function public.touch_updated_at();

create table public.charger_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.charger_listings(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'listing' check (kind in ('listing', 'installation')),
  caption text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index charger_photos_listing_idx on public.charger_photos(listing_id);

-- One row per check. Identity is per host (listing_id null); the rest per listing.
create table public.charger_verifications (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host_profiles(user_id) on delete cascade,
  listing_id uuid references public.charger_listings(id) on delete cascade,
  check_type verification_check not null,
  status verification_status not null default 'not_submitted',
  details jsonb not null default '{}'::jsonb,
  evidence_paths text[] not null default '{}',
  submitted_at timestamptz,
  submission_count int not null default 0,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  decision_reason text,
  is_simulated boolean not null default false, -- demo seed data; never a real verification
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((check_type = 'identity') = (listing_id is null))
);
create unique index verif_identity_unique on public.charger_verifications(host_id) where check_type = 'identity';
create unique index verif_listing_unique on public.charger_verifications(listing_id, check_type) where listing_id is not null;
create index verif_status_idx on public.charger_verifications(status);
create trigger verif_touch before update on public.charger_verifications
  for each row execute function public.touch_updated_at();

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.charger_listings(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_listing_idx on public.availability_rules(listing_id, weekday);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.charger_listings(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index blocked_listing_idx on public.blocked_times(listing_id, start_at);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  listing_id uuid not null references public.charger_listings(id) on delete restrict,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  host_id uuid not null references public.host_profiles(user_id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status booking_status not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- end of the slot including the host's buffer; used for conflict detection
  block_end_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  -- Server-computed price snapshot (never accepted from the client)
  price_per_hour_paise integer not null,
  booking_fee_paise integer not null default 0,
  amount_paise integer not null check (amount_paise > 0),
  commission_bps integer not null check (commission_bps between 0 and 5000),
  commission_paise integer not null check (commission_paise >= 0),
  host_share_paise integer not null check (host_share_paise >= 0),
  cancellation_policy cancellation_policy not null,
  estimate jsonb not null default '{}'::jsonb,
  driver_note text not null default '' check (char_length(driver_note) <= 500),
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_method text check (completion_method in ('host_confirmed', 'admin')),
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('driver', 'host', 'admin', 'system')),
  cancel_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (block_end_at >= end_at),
  check (commission_paise + host_share_paise = amount_paise)
);
create index bookings_driver_idx on public.bookings(driver_id, start_at desc);
create index bookings_host_idx on public.bookings(host_id, start_at desc);
create index bookings_listing_idx on public.bookings(listing_id, start_at);
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- The database itself refuses overlapping active bookings on a charger.
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (
    listing_id with =,
    tstzrange(start_at, block_end_at, '[)') with &&
  ) where (status in ('requested', 'pending_payment', 'confirmed', 'checked_in', 'in_progress'));

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status booking_status,
  to_status booking_status not null,
  actor_id uuid references public.profiles(id),
  actor_role text not null,
  note text,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events(booking_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_booking_idx on public.messages(booking_id, created_at);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null check (provider in ('demo', 'razorpay')),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status payment_status not null default 'created',
  idempotency_key text not null unique,
  failure_reason text,
  captured_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments(booking_id);
-- At most one live (created/captured) payment per booking.
create unique index payments_one_live on public.payments(booking_id) where status in ('created', 'captured');
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Every webhook event we have processed, for idempotent handling of retries.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  unique (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  host_portion_paise integer not null default 0,
  commission_portion_paise integer not null default 0,
  reason text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  status refund_status not null default 'pending',
  provider_refund_id text unique,
  initiated_by uuid references public.profiles(id),
  initiated_role text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (host_portion_paise + commission_portion_paise = amount_paise)
);
create index refunds_booking_idx on public.refunds(booking_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host_profiles(user_id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  status payout_status not null default 'pending',
  period_label text not null default '',
  reference text,
  notes text not null default '',
  created_by uuid references public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_host_idx on public.payouts(host_id);
create trigger payouts_touch before update on public.payouts
  for each row execute function public.touch_updated_at();

-- Append-only accounting entries. Amounts are signed (reversals are negative).
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  booking_id uuid references public.bookings(id) on delete restrict,
  payment_id uuid references public.payments(id),
  refund_id uuid references public.refunds(id),
  payout_id uuid references public.payouts(id),
  host_id uuid references public.host_profiles(user_id),
  entry_type ledger_entry_type not null,
  amount_paise integer not null,
  is_estimate boolean not null default false,
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index ledger_booking_idx on public.ledger_entries(booking_id);
create index ledger_host_idx on public.ledger_entries(host_id, entry_type);
-- A booking is booked into the ledger exactly once.
create unique index ledger_one_capture on public.ledger_entries(payment_id, entry_type)
  where refund_id is null and payout_id is null and payment_id is not null;

create or replace function public.ledger_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only';
end $$;
create trigger ledger_no_update before update or delete on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Trust, support, notifications, audit
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  listing_id uuid not null references public.charger_listings(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  host_reply text check (host_reply is null or char_length(host_reply) <= 1000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_listing_idx on public.reviews(listing_id);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  category text not null check (category in ('booking', 'payment', 'refund', 'charger_issue', 'account', 'host', 'safety', 'other')),
  subject text not null check (char_length(subject) between 4 and 140),
  description text not null check (char_length(description) between 10 and 4000),
  status ticket_status not null default 'open',
  admin_response text,
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_user_idx on public.support_tickets(user_id);
create trigger tickets_touch before update on public.support_tickets
  for each row execute function public.touch_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('listing', 'user', 'booking')),
  target_id uuid not null,
  reason text not null check (reason in ('safety_hazard', 'electrical_issue', 'misleading_listing', 'access_problem', 'harassment', 'fraud', 'damage', 'other')),
  details text not null check (char_length(details) between 10 and 4000),
  severity report_severity not null default 'medium',
  status report_status not null default 'open',
  resolution_note text,
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports(status);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.admin_audit_logs(created_at desc);
create trigger audit_no_update before update or delete on public.admin_audit_logs
  for each row execute function public.ledger_is_append_only();

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('commission_bps', '1500', 'Platform commission on booking value, in basis points (1500 = 15%).'),
  ('tax_on_commission_bps', '1800', 'Estimated GST on platform commission, in basis points. Confirm with a chartered accountant.'),
  ('processing_fee_bps', '200', 'Estimated payment gateway fee, in basis points, used until the provider reports actual fees.'),
  ('payment_hold_minutes', '15', 'How long an unpaid booking holds its slot.'),
  ('request_response_hours', '12', 'How long a host has to respond to a booking request.');
