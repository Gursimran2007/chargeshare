-- Email delivery state. notify() queues an email row inside the business
-- transaction; a worker delivers it after commit, so a rolled-back action never
-- sends mail and a provider outage never blocks a booking.
alter table public.notifications
  add column delivery_status text check (delivery_status in ('pending', 'sent', 'outbox', 'blocked', 'failed')),
  add column delivery_attempts integer not null default 0,
  add column delivered_at timestamptz,
  add column delivery_error text;

update public.notifications set delivery_status = 'outbox', delivered_at = created_at where channel = 'email';

create index notifications_email_pending_idx on public.notifications(created_at)
  where channel = 'email' and delivery_status = 'pending';
