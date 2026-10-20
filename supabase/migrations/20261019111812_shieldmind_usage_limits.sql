
begin;

create schema if not exists private;

create table if not exists private.shieldmind_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_type text not null check (window_type in ('minute', 'day')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, window_type, window_start)
);

create index if not exists shieldmind_usage_windows_window_idx
  on private.shieldmind_usage_windows (window_start);

alter table private.shieldmind_usage_windows enable row level security;
revoke all on table private.shieldmind_usage_windows from public, anon, authenticated;

create or replace function public.consume_shieldmind_quota()
returns table (allowed boolean, remaining integer)
language plpgsql
volatile
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
begin
  if v_user_id is null then
    return query select false, 0;
    return;
  end if;

  insert into private.shieldmind_usage_windows (user_id, window_type, window_start, request_count)
  values (v_user_id, 'minute', v_minute_start, 1)
  on conflict (user_id, window_type, window_start)
  do update
    set request_count = private.shieldmind_usage_windows.request_count + 1
    where private.shieldmind_usage_windows.request_count < 5
  returning request_count into v_minute_count;

  if not found then
    return query select false, 0;
    return;
  end if;

  insert into private.shieldmind_usage_windows (user_id, window_type, window_start, request_count)
  values (v_user_id, 'day', v_day_start, 1)
  on conflict (user_id, window_type, window_start)
  do update
    set request_count = private.shieldmind_usage_windows.request_count + 1
    where private.shieldmind_usage_windows.request_count < 80
  returning request_count into v_day_count;

  if not found then
    return query select false, 0;
    return;
  end if;

  delete from private.shieldmind_usage_windows
    where window_start < v_now - interval '2 days';

  return query
    select true, greatest(0, least(5 - v_minute_count, 80 - v_day_count));
end;
$function$;

revoke all on function public.consume_shieldmind_quota() from public, anon;
grant execute on function public.consume_shieldmind_quota() to authenticated;

commit;
