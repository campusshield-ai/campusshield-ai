-- ShieldMind: 30-day plan allowances and auditable provider token costs.
-- A request is charged against the allowance at the authenticated quota gate.
-- Actual OpenAI input/output usage is written by server-side Edge Functions only.

create table if not exists private.shieldmind_monthly_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(18,10) not null default 0 check (estimated_cost_usd >= 0),
  last_model text not null default 'gpt-6-luna',
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);
revoke all on table private.shieldmind_monthly_usage from public, anon, authenticated;

create or replace function private.consume_shieldmind_quota_impl()
returns table(allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', clock_timestamp());
  v_day_start timestamptz := date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_plan text;
  v_period_start timestamptz;
  v_minute_limit integer := 5;
  v_day_limit integer := 25;
  v_month_limit integer := 200;
  v_minute_count integer;
  v_day_count integer;
  v_month_count integer;
  v_session private.shieldmind_session_windows%rowtype;
begin
  if v_user_id is null then
    return query select false, 0;
    return;
  end if;

  select s.plan, coalesce(s.started_at, s.created_at)
    into v_plan, v_period_start
  from public.shieldmind_subscriptions s
  where s.user_id = v_user_id
    and s.status = 'active'
    and s.expires_at > v_now
    and s.plan in ('starter','plus','pro','ultra','max','premium')
  limit 1;

  if not found or v_period_start is null then
    return query select false, 0;
    return;
  end if;

  case v_plan
    when 'starter' then v_minute_limit := 5;  v_day_limit := 25;  v_month_limit := 150;
    when 'plus'    then v_minute_limit := 10; v_day_limit := 40;  v_month_limit := 400;
    when 'pro'     then v_minute_limit := 15; v_day_limit := 80;  v_month_limit := 1000;
    when 'ultra'   then v_minute_limit := 20; v_day_limit := 120; v_month_limit := 2000;
    when 'max'     then v_minute_limit := 30; v_day_limit := 200; v_month_limit := 3500;
    when 'premium' then v_minute_limit := 5;  v_day_limit := 25;  v_month_limit := 150;
    else
      return query select false, 0;
      return;
  end case;

  insert into private.shieldmind_session_windows(user_id,session_started_at,cooldown_until,updated_at)
  values(v_user_id,null,null,v_now)
  on conflict(user_id) do nothing;

  -- Serialize all of this account's AI requests before checking/updating counters.
  select * into v_session
  from private.shieldmind_session_windows
  where user_id = v_user_id
  for update;

  if v_session.cooldown_until is not null and v_now < v_session.cooldown_until then
    return query select false, 0;
    return;
  end if;

  if v_session.session_started_at is not null
     and v_now >= v_session.session_started_at + interval '8 hours' then
    update private.shieldmind_session_windows
       set session_started_at = null,
           cooldown_until = v_now + interval '1 hour',
           updated_at = v_now
     where user_id = v_user_id;
    return query select false, 0;
    return;
  end if;

  if v_session.session_started_at is null then
    update private.shieldmind_session_windows
       set session_started_at = v_now, cooldown_until = null, updated_at = v_now
     where user_id = v_user_id;
  end if;

  insert into private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
  values(v_user_id,'minute',v_minute_start,0)
  on conflict(user_id,window_type,window_start) do nothing;

  insert into private.shieldmind_usage_windows(user_id,window_type,window_start,request_count)
  values(v_user_id,'day',v_day_start,0)
  on conflict(user_id,window_type,window_start) do nothing;

  insert into private.shieldmind_monthly_usage(user_id,period_start)
  values(v_user_id,v_period_start)
  on conflict(user_id,period_start) do nothing;

  select u.request_count into v_minute_count
  from private.shieldmind_usage_windows u
  where u.user_id=v_user_id and u.window_type='minute' and u.window_start=v_minute_start
  for update;

  select u.request_count into v_day_count
  from private.shieldmind_usage_windows u
  where u.user_id=v_user_id and u.window_type='day' and u.window_start=v_day_start
  for update;

  select u.request_count into v_month_count
  from private.shieldmind_monthly_usage u
  where u.user_id=v_user_id and u.period_start=v_period_start
  for update;

  -- Check every cap before incrementing any counter, so a rejected call consumes no allowance.
  if coalesce(v_minute_count,0) >= v_minute_limit
     or coalesce(v_day_count,0) >= v_day_limit
     or coalesce(v_month_count,0) >= v_month_limit then
    return query select false, greatest(0,v_month_limit-coalesce(v_month_count,0));
    return;
  end if;

  update private.shieldmind_usage_windows
     set request_count=request_count+1
   where user_id=v_user_id and window_type='minute' and window_start=v_minute_start;

  update private.shieldmind_usage_windows
     set request_count=request_count+1
   where user_id=v_user_id and window_type='day' and window_start=v_day_start;

  update private.shieldmind_monthly_usage
     set request_count=request_count+1, updated_at=v_now
   where user_id=v_user_id and period_start=v_period_start;

  delete from private.shieldmind_usage_windows
   where window_type in ('minute','day') and window_start < v_now-interval '2 days';
  delete from private.shieldmind_monthly_usage
   where period_start < v_now-interval '400 days';

  return query select true, greatest(0,v_month_limit-v_month_count-1);
end;
$function$;

revoke all on function private.consume_shieldmind_quota_impl() from public, anon;
grant execute on function private.consume_shieldmind_quota_impl() to authenticated;

create or replace function private.record_shieldmind_usage_impl(
  p_user_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_model text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period_start timestamptz;
  v_now timestamptz := clock_timestamp();
  v_cost numeric(18,10);
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Server-side usage recording only' using errcode='42501';
  end if;
  if p_user_id is null
     or coalesce(p_input_tokens,-1) < 0
     or coalesce(p_output_tokens,-1) < 0
     or p_input_tokens > 2000000
     or p_output_tokens > 200000 then
    raise exception 'Invalid token usage values' using errcode='22023';
  end if;
  if p_model <> 'gpt-6-luna' then
    raise exception 'Unsupported ShieldMind usage model' using errcode='22023';
  end if;

  select coalesce(s.started_at,s.created_at) into v_period_start
  from public.shieldmind_subscriptions s
  where s.user_id=p_user_id and s.plan in ('starter','plus','pro','ultra','max','premium')
    and s.status='active' and s.expires_at>v_now;

  if not found or v_period_start is null then
    return false;
  end if;

  -- GPT-6 Luna standard text/image token rates: $0.10/M input and $0.50/M output.
  -- Image input tokens are included in prompt_tokens by Chat Completions.
  v_cost := round(
    (p_input_tokens::numeric * 0.10 + p_output_tokens::numeric * 0.50) / 1000000,
    10
  );

  update private.shieldmind_monthly_usage
     set input_tokens=input_tokens+p_input_tokens,
         output_tokens=output_tokens+p_output_tokens,
         estimated_cost_usd=estimated_cost_usd+v_cost,
         last_model=p_model,
         updated_at=v_now
   where user_id=p_user_id and period_start=v_period_start;

  return found;
end;
$function$;
revoke all on function private.record_shieldmind_usage_impl(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function private.record_shieldmind_usage_impl(uuid,bigint,bigint,text) to service_role;

create or replace function public.record_shieldmind_usage(
  p_user_id uuid,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_model text
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.record_shieldmind_usage_impl(p_user_id,p_input_tokens,p_output_tokens,p_model);
$function$;
revoke all on function public.record_shieldmind_usage(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.record_shieldmind_usage(uuid,bigint,bigint,text) to service_role;

create or replace function private.get_my_shieldmind_usage_impl()
returns table(
  plan text,
  request_limit integer,
  requests_used integer,
  requests_remaining integer,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric,
  period_start timestamptz,
  expires_at timestamptz,
  image_upload_limit integer,
  image_uploads_used integer,
  last_model text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_plan text;
  v_period_start timestamptz;
  v_expires_at timestamptz;
  v_image_limit integer;
  v_request_limit integer;
  v_month_row private.shieldmind_monthly_usage%rowtype;
  v_image_used integer := 0;
begin
  if v_user_id is null then return; end if;

  select s.plan,coalesce(s.started_at,s.created_at),s.expires_at,s.image_upload_limit
    into v_plan,v_period_start,v_expires_at,v_image_limit
  from public.shieldmind_subscriptions s
  where s.user_id=v_user_id and s.status='active' and s.expires_at>now()
    and s.plan in ('starter','plus','pro','ultra','max','premium')
  limit 1;
  if not found or v_period_start is null then return; end if;

  v_request_limit := case v_plan
    when 'starter' then 150
    when 'plus' then 400
    when 'pro' then 1000
    when 'ultra' then 2000
    when 'max' then 3500
    when 'premium' then 150
    else 0 end;

  select * into v_month_row from private.shieldmind_monthly_usage
  where user_id=v_user_id and period_start=v_period_start;

  select coalesce(i.upload_count,0) into v_image_used
  from private.shieldmind_image_usage_windows i
  where i.user_id=v_user_id
    and i.month_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';

  return query select
    v_plan,
    v_request_limit,
    coalesce(v_month_row.request_count,0),
    greatest(0,v_request_limit-coalesce(v_month_row.request_count,0)),
    coalesce(v_month_row.input_tokens,0),
    coalesce(v_month_row.output_tokens,0),
    coalesce(v_month_row.estimated_cost_usd,0),
    v_period_start,
    v_expires_at,
    coalesce(v_image_limit,0),
    coalesce(v_image_used,0),
    coalesce(v_month_row.last_model,'gpt-6-luna');
end;
$function$;
revoke all on function private.get_my_shieldmind_usage_impl() from public,anon;
grant execute on function private.get_my_shieldmind_usage_impl() to authenticated;

create or replace function public.get_my_shieldmind_usage()
returns table(
  plan text,
  request_limit integer,
  requests_used integer,
  requests_remaining integer,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric,
  period_start timestamptz,
  expires_at timestamptz,
  image_upload_limit integer,
  image_uploads_used integer
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.get_my_shieldmind_usage_impl();
$function$;
revoke all on function public.get_my_shieldmind_usage() from public,anon;
grant execute on function public.get_my_shieldmind_usage() to authenticated;

comment on table private.shieldmind_monthly_usage is
  'Server-only 30-day ShieldMind request and OpenAI token cost ledger, keyed to subscription period start.';
