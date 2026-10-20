-- ShieldMind Premium billing foundation. Staging rollout only until reviewed.
create table if not exists public.shieldmind_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium')),
  status text not null default 'free' check (status in ('free','pending','active','expired','failed')),
  billing_period text check (billing_period in ('monthly','annual')),
  provider text check (provider in ('paystack')),
  provider_reference text unique,
  amount_kobo integer check (amount_kobo is null or amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  started_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint premium_has_period check (plan <> 'premium' or billing_period is not null)
);
alter table public.shieldmind_subscriptions enable row level security;
revoke all on public.shieldmind_subscriptions from anon, authenticated;
grant select on public.shieldmind_subscriptions to authenticated;
drop policy if exists "Users can view own ShieldMind subscription" on public.shieldmind_subscriptions;
create policy "Users can view own ShieldMind subscription"
  on public.shieldmind_subscriptions for select to authenticated
  using (auth.uid() = user_id);

-- Only the server-side service role may create or modify subscription entitlements.
-- No client INSERT/UPDATE/DELETE policies are intentionally provided.
create or replace function public.get_my_shieldmind_plan()
returns table(plan text, status text, billing_period text, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when s.plan = 'premium' and s.status = 'active' and s.expires_at > now()
      then 'premium' else 'free' end,
    case when s.plan = 'premium' and s.status = 'active' and s.expires_at <= now()
      then 'expired' else coalesce(s.status, 'free') end,
    s.billing_period,
    s.expires_at
  from (select auth.uid() as uid) caller
  left join public.shieldmind_subscriptions s on s.user_id = caller.uid
  where caller.uid is not null
$$;
revoke all on function public.get_my_shieldmind_plan() from public, anon;
grant execute on function public.get_my_shieldmind_plan() to authenticated;
