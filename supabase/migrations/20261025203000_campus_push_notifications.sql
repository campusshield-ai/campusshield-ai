-- Background Web Push storage. Push payloads must remain generic and never contain
-- private message bodies, incident details, identity documents, or credentials.
create table if not exists public.campus_push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://'),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh_key text not null check (char_length(p256dh_key) between 20 and 200),
  auth_key text not null check (char_length(auth_key) between 8 and 100),
  expiration_time timestamptz,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error_code integer
);

create table if not exists public.campus_push_delivery_events (
  event_key text primary key check (char_length(event_key) between 10 and 220),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('timetable_reminder','new_message','campus_announcement','account_update','test')),
  status text not null default 'queued' check (status in ('queued','sent','no_subscription','failed')),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_push_subscriptions_user_id_idx
  on public.campus_push_subscriptions(user_id);
create index if not exists campus_push_delivery_events_user_created_idx
  on public.campus_push_delivery_events(user_id, created_at desc);

alter table public.campus_push_subscriptions enable row level security;
alter table public.campus_push_delivery_events enable row level security;

drop policy if exists campus_push_subscriptions_no_direct_client_access on public.campus_push_subscriptions;
create policy campus_push_subscriptions_no_direct_client_access
  on public.campus_push_subscriptions
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists campus_push_delivery_events_no_direct_client_access on public.campus_push_delivery_events;
create policy campus_push_delivery_events_no_direct_client_access
  on public.campus_push_delivery_events
  for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.campus_push_subscriptions from anon, authenticated;
revoke all on table public.campus_push_delivery_events from anon, authenticated;
grant all on table public.campus_push_subscriptions to service_role;
grant all on table public.campus_push_delivery_events to service_role;
