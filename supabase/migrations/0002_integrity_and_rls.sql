-- Integrity guards + Row Level Security.
--
-- The Next.js server performs privileged writes through a trusted connection
-- after its own authorisation checks. RLS is the second line of defence: it
-- governs anything reached with an end-user JWT (e.g. the Supabase anon key
-- from a browser) so a client can never read another user's private data or
-- forge prices, payments, verifications or audit records.

-- ---------------------------------------------------------------------------
-- Business invariants enforced in the database
-- ---------------------------------------------------------------------------
create or replace function public.listing_checks_complete(p_listing uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.charger_verifications v
       where v.listing_id = p_listing and v.status = 'verified'
         and v.check_type in ('property_permission', 'charger_spec', 'installation_evidence', 'electrical_safety')) = 4
    and exists (
      select 1 from public.charger_verifications v
      join public.charger_listings l on l.host_id = v.host_id
      where l.id = p_listing and v.check_type = 'identity' and v.status = 'verified')
$$;

create or replace function public.guard_listing_write() returns trigger
language plpgsql as $$
declare
  privileged boolean := public.is_trusted_context() or public.is_admin();
begin
  if new.status = 'active' and not public.listing_checks_complete(new.id) then
    raise exception 'listing cannot be active until all verification checks are approved'
      using errcode = 'check_violation';
  end if;
  if privileged then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') or new.approved_at is not null or new.is_demo then
      raise exception 'not allowed' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.is_demo is distinct from old.is_demo
     or new.rejection_reason is distinct from old.rejection_reason
     or new.suspended_reason is distinct from old.suspended_reason
     or new.host_id is distinct from old.host_id then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (old.status in ('draft', 'changes_requested', 'rejected') and new.status = 'pending_review')
    or (old.status = 'active' and new.status = 'paused')
  ) then
    raise exception 'status change % -> % requires review', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'suspended' then
    raise exception 'suspended listings cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger listings_guard before insert or update on public.charger_listings
  for each row execute function public.guard_listing_write();

create or replace function public.guard_verification_write() returns trigger
language plpgsql as $$
begin
  if public.is_trusted_context() or public.is_admin() then
    return new;
  end if;
  if new.status not in ('not_submitted', 'pending_review')
     or new.is_simulated
     or (tg_op = 'UPDATE' and (
           new.reviewed_by is distinct from old.reviewed_by
        or new.reviewed_at is distinct from old.reviewed_at
        or new.decision_reason is distinct from old.decision_reason
        or new.host_id is distinct from old.host_id
        or old.status = 'suspended'))
     or (tg_op = 'INSERT' and new.reviewed_by is not null) then
    raise exception 'hosts cannot approve or alter verification decisions'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger verifications_guard before insert or update on public.charger_verifications
  for each row execute function public.guard_verification_write();

create or replace function public.guard_profile_write() returns trigger
language plpgsql as $$
begin
  if public.is_trusted_context() or public.is_admin() then
    return new;
  end if;
  if new.is_restricted is distinct from old.is_restricted
     or new.restricted_reason is distinct from old.restricted_reason
     or new.id is distinct from old.id then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_write();

-- ---------------------------------------------------------------------------
-- Public, privacy-safe views (approximate location, no private contact data)
-- ---------------------------------------------------------------------------
create view public.public_listings as
  select l.id, l.title, l.description, l.property_type, l.connector_type, l.charger_make, l.charger_model,
         l.rated_power_kw, l.locality, l.city, l.approx_lat, l.approx_lng, l.access_type,
         l.parking_details, l.restrictions, l.amenities, l.supported_vehicle_notes,
         l.price_per_hour_paise, l.booking_fee_paise, l.min_duration_minutes, l.max_duration_minutes,
         l.buffer_minutes, l.cancellation_policy, l.instant_book, l.is_demo, l.host_id,
         h.display_name as host_display_name, h.host_type
  from public.charger_listings l
  join public.host_profiles h on h.user_id = l.host_id
  where l.status = 'active';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.connector_types enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicles enable row level security;
alter table public.host_profiles enable row level security;
alter table public.charger_listings enable row level security;
alter table public.charger_photos enable row level security;
alter table public.charger_verifications enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_times enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.payouts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.reviews enable row level security;
alter table public.support_tickets enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.platform_settings enable row level security;

-- Reference data: readable by everyone, writable by admins.
create policy connector_types_read on public.connector_types for select using (true);
create policy connector_types_admin on public.connector_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy vehicle_models_read on public.vehicle_models for select using (true);
create policy vehicle_models_admin on public.vehicle_models for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy settings_read on public.platform_settings for select using (true);
create policy settings_admin on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: you see and edit yourself; admins see everyone.
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Roles: read your own. Nobody grants roles from the client.
create policy roles_self_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Vehicles: owner only.
create policy vehicles_owner on public.vehicles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Host profiles: owner (and admins). Public fields are exposed via public_listings.
create policy host_profiles_owner_read on public.host_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy host_profiles_owner_insert on public.host_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.has_role('host'));
create policy host_profiles_owner_update on public.host_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Listings: only the host (or admin) reads the raw row; it holds the exact
-- address and access instructions. Everyone else uses public_listings.
create policy listings_owner_read on public.charger_listings for select to authenticated
  using (host_id = auth.uid() or public.is_admin());
create policy listings_owner_insert on public.charger_listings for insert to authenticated
  with check (host_id = auth.uid() and public.has_role('host'));
create policy listings_owner_update on public.charger_listings for update to authenticated
  using (host_id = auth.uid() or public.is_admin()) with check (host_id = auth.uid() or public.is_admin());

create policy photos_public_read on public.charger_photos for select
  using (kind = 'listing' and exists (select 1 from public.charger_listings l where l.id = listing_id and l.status = 'active')
         or exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid())
         or public.is_admin());
create policy photos_owner_write on public.charger_photos for all to authenticated
  using (exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid()))
  with check (exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid()));

create policy verif_owner_read on public.charger_verifications for select to authenticated
  using (host_id = auth.uid() or public.is_admin());
create policy verif_owner_insert on public.charger_verifications for insert to authenticated
  with check (host_id = auth.uid());
create policy verif_owner_update on public.charger_verifications for update to authenticated
  using (host_id = auth.uid() or public.is_admin()) with check (host_id = auth.uid() or public.is_admin());

create policy availability_read on public.availability_rules for select
  using (exists (select 1 from public.charger_listings l where l.id = listing_id
                 and (l.status = 'active' or l.host_id = auth.uid() or public.is_admin())));
create policy availability_owner_write on public.availability_rules for all to authenticated
  using (exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid()))
  with check (exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid()));

create policy blocked_owner on public.blocked_times for all to authenticated
  using (exists (select 1 from public.charger_listings l where l.id = listing_id and (l.host_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.charger_listings l where l.id = listing_id and l.host_id = auth.uid()));

-- Bookings: participants read; writes only from the trusted server (prices are server-computed).
create policy bookings_participant_read on public.bookings for select to authenticated
  using (driver_id = auth.uid() or host_id = auth.uid() or public.is_admin());
create policy booking_events_read on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.driver_id = auth.uid() or b.host_id = auth.uid() or public.is_admin())));
create policy messages_participant_read on public.messages for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.driver_id = auth.uid() or b.host_id = auth.uid() or public.is_admin())));

-- Money: drivers see their own payments/refunds; hosts see their own ledger
-- and payouts; nobody writes from the client.
create policy payments_driver_read on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.driver_id = auth.uid())
         or public.is_admin());
create policy refunds_participant_read on public.refunds for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.driver_id = auth.uid() or b.host_id = auth.uid()))
         or public.is_admin());
create policy payouts_host_read on public.payouts for select to authenticated
  using (host_id = auth.uid() or public.is_admin());
create policy ledger_host_read on public.ledger_entries for select to authenticated
  using ((host_id = auth.uid() and entry_type in ('host_share', 'payout')) or public.is_admin());
create policy payment_events_admin on public.payment_events for select to authenticated
  using (public.is_admin());

-- Reviews are public unless hidden by moderation.
create policy reviews_public_read on public.reviews for select
  using (not is_hidden or author_id = auth.uid() or public.is_admin());

create policy tickets_owner_read on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy tickets_owner_insert on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and admin_response is null and assigned_to is null);
create policy tickets_admin_update on public.support_tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy reports_owner_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_owner_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and handled_by is null);
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy notifications_owner_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_owner_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_admin_read on public.admin_audit_logs for select to authenticated
  using (public.is_admin());

-- Belt and braces: end users never write money, booking or audit tables directly.
revoke insert, update, delete on public.bookings, public.booking_events, public.payments,
  public.payment_events, public.refunds, public.payouts, public.ledger_entries,
  public.admin_audit_logs, public.reviews, public.messages, public.user_roles
  from anon, authenticated;
revoke all on public.charger_listings, public.host_profiles from anon;
grant select on public.public_listings to anon, authenticated;
