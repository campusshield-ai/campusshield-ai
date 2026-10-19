-- ShieldMind tiered entitlements and server-enforced 8h / 1h session cycle.
-- Apply to staging first. Subscription writes remain service-role only.
alter table public.shieldmind_subscriptions
  drop constraint if exists shieldmind_subscriptions_plan_check;
alter table public.shieldmind_subscriptions
  add constraint shieldmind_subscriptions_plan_check
  check (plan in ('free','starter','plus','pro','ultra','max','premium'));
alter table public.shieldmind_subscriptions
  drop constraint if exists shieldmind_subscriptions_billing_period_check;
alter table public.shieldmind_subscriptions
  add constraint shieldmind_subscriptions_billing_period_check
  check (billing_period in ('monthly','annual'));
alter table public.shieldmind_subscriptions
  add column if not exists image_upload_limit integer not null default 0
  check (image_upload_limit >= 0);

create table if not exists private.shieldmind_session_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_started_at timestamptz,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.shieldmind_session_windows from public, anon, authenticated;

create or replace function public.get_my_shieldmind_plan()
returns table(plan text, status text, billing_period text, expires_at timestamptz, image_upload_limit integer)
language sql stable security invoker set search_path = ''
as $$
  select
    case when s.plan in ('starter','plus','pro','ultra','max','premium')
      and s.status = 'active' and s.expires_at > now() then s.plan else 'free' end,
    case when s.plan in ('starter','plus','pro','ultra','max','premium')
      and s.status = 'active' and s.expires_at <= now() then 'expired' else coalesce(s.status,'free') end,
    s.billing_period, s.expires_at,
    case when s.plan in ('starter','plus','pro','ultra','max','premium')
      and s.status = 'active' and s.expires_at > now() then coalesce(s.image_upload_limit,0) else 0 end
  from (select auth.uid() as uid) caller
  left join public.shieldmind_subscriptions s on s.user_id = caller.uid
  where caller.uid is not null
$$;
revoke all on function public.get_my_shieldmind_plan() from public, anon;
grant execute on function public.get_my_shieldmind_plan() to authenticated;

create or replace function public.consume_shieldmind_quota()
returns table(allowed boolean, remaining integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', clock_timestamp());
  v_day_start timestamptz := date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_plan text := 'free';
  v_minute_limit integer := 5;
  v_day_limit integer := 80;
  v_minute_count integer;
  v_day_count integer;
  v_session private.shieldmind_session_windows%rowtype;
begin
  if v_user_id is null then return query select false, 0; return; end if;

  select s.plan into v_plan from public.shieldmind_subscriptions s
    where s.user_id = v_user_id and s.status = 'active' and s.expires_at > v_now
      and s.plan in ('starter','plus','pro','ultra','max','premium');

  case coalesce(v_plan,'free')
    when 'starter' then v_minute_limit := 10; v_day_limit := 250;
    when 'plus' then v_minute_limit := 15; v_day_limit := 700;
    when 'pro' then v_minute_limit := 25; v_day_limit := 1500;
    when 'ultra' then v_minute_limit := 35; v_day_limit := 2500;
    when 'max' then v_minute_limit := 50; v_day_limit := 4000;
    when 'premium' then v_minute_limit := 10; v_day_limit := 250;
    else v_minute_limit := 5; v_day_limit := 80;
  end case;

  insert into private.shieldmind_session_windows(user_id,session_started_at,cooldown_until,updated_at)
    values(v_user_id,null,null,v_now) on conflict(user_id) do nothing;
  select * into v_session from private.shieldmind_session_windows where user_id=v_user_id for update;

  if v_session.cooldown_until is not null and v_now < v_session.cooldown_until then
    return query select false, 0; return;
  end if;
  if v_session.session_started_at is not null
      and v_now >= v_session.session_started_at + interval '8 hours' then
    update private.shieldmind_session_windows
      set session_started_at = null, cooldown_until = v_now + interval '1 hour', updated_at = v_now
      where user_id = v_user_id;
    return query select false, 0; return;
  end if;
  if v_session.session_started_at is null then
    update private.shieldmind_session_windows
      set session_started_at = v_now, cooldown_until = null, updated_at = v_now
      where user_id = v_user_id;
  end if;

  insert into private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
    values(v_user_id,'minute',v_minute_start,1)
    on conflict(user_id,window_type,window_start)
    do update set request_count = private.shieldmind_usage_windows.request_count + 1
      where private.shieldmind_usage_windows.request_count < v_minute_limit
    returning request_count into v_minute_count;
  if not found then return query select false,0; return; end if;

  insert into private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
    values(v_user_id,'day',v_day_start,1)
    on conflict(user_id,window_type,window_start)
    do update set request_count = private.shieldmind_usage_windows.request_count + 1
      where private.shieldmind_usage_windows.request_count < v_day_limit
    returning request_count into v_day_count;
  if not found then return query select false,0; return; end if;

  delete from private.shieldmind_usage_windows where window_start < v_now - interval '2 days';
  return query select true, greatest(0,least(v_minute_limit-v_minute_count,v_day_limit-v_day_count));
end;
$function$;
revoke all on function public.consume_shieldmind_quota() from public, anon;
grant execute on function public.consume_shieldmind_quota() to authenticated;
