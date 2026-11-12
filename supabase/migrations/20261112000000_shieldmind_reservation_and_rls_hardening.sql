-- Harden the monthly ShieldMind usage ledger and make failed provider calls
-- release reserved allowance. The ledger is private and server-maintained only.

alter table private.shieldmind_monthly_usage enable row level security;
revoke all on table private.shieldmind_monthly_usage from public, anon, authenticated;

-- Do not depend on the deprecated auth.role() helper for service-role checks.
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
  v_jwt_role text;
begin
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_jwt_role <> 'service_role' then
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
  -- Counting cached input at the uncached rate is intentionally conservative.
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

-- A provider HTTP rejection did not produce a usable answer. Return the reserved
-- 30-day request (and an image upload, when applicable) to the same account.
create or replace function private.release_shieldmind_usage_reservation_impl(
  p_user_id uuid,
  p_release_image boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period_start timestamptz;
  v_jwt_role text;
  v_released boolean := false;
  v_month_start timestamptz := date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_jwt_role <> 'service_role' then
    raise exception 'Server-side usage reservation release only' using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'Invalid ShieldMind user' using errcode='22023';
  end if;

  select coalesce(s.started_at,s.created_at) into v_period_start
  from public.shieldmind_subscriptions s
  where s.user_id=p_user_id and s.plan in ('starter','plus','pro','ultra','max','premium')
    and s.status='active' and s.expires_at>clock_timestamp();

  if not found or v_period_start is null then
    return false;
  end if;

  update private.shieldmind_monthly_usage
     set request_count=request_count-1, updated_at=clock_timestamp()
   where user_id=p_user_id and period_start=v_period_start and request_count>0;
  v_released := found;

  if p_release_image then
    update private.shieldmind_image_usage_windows
       set upload_count=upload_count-1
     where user_id=p_user_id and month_start=v_month_start and upload_count>0;
  end if;

  return v_released;
end;
$function$;
revoke all on function private.release_shieldmind_usage_reservation_impl(uuid,boolean) from public,anon,authenticated;
grant execute on function private.release_shieldmind_usage_reservation_impl(uuid,boolean) to service_role;

create or replace function public.release_shieldmind_usage_reservation(
  p_user_id uuid,
  p_release_image boolean default false
)
returns boolean
language sql
security invoker
set search_path = ''
as $function$
  select private.release_shieldmind_usage_reservation_impl(p_user_id,p_release_image);
$function$;
revoke all on function public.release_shieldmind_usage_reservation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.release_shieldmind_usage_reservation(uuid,boolean) to service_role;

comment on table private.shieldmind_monthly_usage is
  'Private 30-day ShieldMind request and OpenAI token-cost ledger; only server-side functions write usage.';
