-- Upgrade ShieldMind quota limits based on server-verified entitlement.
-- Free remains useful; Premium receives higher, bounded usage.
create or replace function public.consume_shieldmind_quota()
returns table(allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', v_now);
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_minute_count integer;
  v_day_count integer;
  v_minute_limit integer := 5;
  v_day_limit integer := 80;
begin
  if v_user_id is null then
    return query select false, 0;
    return;
  end if;

  if exists (
    select 1 from public.shieldmind_subscriptions s
    where s.user_id = v_user_id
      and s.plan = 'premium'
      and s.status = 'active'
      and s.expires_at > v_now
  ) then
    v_minute_limit := 20;
    v_day_limit := 500;
  end if;

  insert into private.shieldmind_usage_windows (user_id, window_type, window_start, request_count)
  values (v_user_id, 'minute', v_minute_start, 1)
  on conflict (user_id, window_type, window_start)
  do update set request_count = private.shieldmind_usage_windows.request_count + 1
    where private.shieldmind_usage_windows.request_count < v_minute_limit
  returning request_count into v_minute_count;
  if not found then
    return query select false, 0;
    return;
  end if;

  insert into private.shieldmind_usage_windows (user_id, window_type, window_start, request_count)
  values (v_user_id, 'day', v_day_start, 1)
  on conflict (user_id, window_type, window_start)
  do update set request_count = private.shieldmind_usage_windows.request_count + 1
    where private.shieldmind_usage_windows.request_count < v_day_limit
  returning request_count into v_day_count;
  if not found then
    return query select false, 0;
    return;
  end if;

  delete from private.shieldmind_usage_windows where window_start < v_now - interval '2 days';
  return query select true, greatest(0, least(v_minute_limit - v_minute_count, v_day_limit - v_day_count));
end;
$function$;
revoke all on function public.consume_shieldmind_quota() from public, anon;
grant execute on function public.consume_shieldmind_quota() to authenticated;
