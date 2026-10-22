begin;
alter table public.shieldmind_subscriptions
 add column if not exists provider_subscription_code text,
 add column if not exists provider_customer_code text,
 add column if not exists renewal_status text not null default 'unknown' check (renewal_status in ('unknown','active','non-renewing','attention','cancelled','completed')),
 add column if not exists last_payment_reference text,
 add column if not exists last_payment_at timestamptz;
create unique index if not exists shieldmind_subscriptions_provider_subscription_code_uidx on public.shieldmind_subscriptions(provider_subscription_code) where provider_subscription_code is not null;
create table if not exists private.shieldmind_billing_intents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 email text not null,
 plan text not null check (plan in ('starter','plus','pro','ultra','max')),
 amount_kobo integer not null check (amount_kobo > 0),
 currency text not null default 'NGN' check (currency='NGN'),
 status text not null default 'pending' check (status in ('pending','matched','expired','cancelled')),
 expires_at timestamptz not null default (now()+interval '90 minutes'),
 provider_subscription_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists shieldmind_billing_intents_pending_email_idx on private.shieldmind_billing_intents(lower(email),plan,created_at desc) where status='pending';
create unique index if not exists shieldmind_billing_intents_subscription_code_uidx on private.shieldmind_billing_intents(provider_subscription_code) where provider_subscription_code is not null;
alter table private.shieldmind_billing_intents enable row level security;
revoke all on table private.shieldmind_billing_intents from public,anon,authenticated;
create table if not exists private.paystack_billing_event_receipts (
 event_key text primary key,
 event_type text not null,
 status text not null default 'processing' check (status in ('processing','processed','failed')),
 received_at timestamptz not null default now(),
 processed_at timestamptz,
 last_error text
);
alter table private.paystack_billing_event_receipts enable row level security;
revoke all on table private.paystack_billing_event_receipts from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update on table private.shieldmind_billing_intents to service_role;
grant select,insert,update on table private.paystack_billing_event_receipts to service_role;
commit;
