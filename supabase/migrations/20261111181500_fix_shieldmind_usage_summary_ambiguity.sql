-- Fix PL/pgSQL output-column shadowing in the ShieldMind usage summary.
-- period_start is both a RETURNS TABLE output name and a column on the private
-- ledger. Qualify every ledger reference so the authenticated summary works.

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

  select s.plan, coalesce(s.started_at, s.created_at), s.expires_at, s.image_upload_limit
    into v_plan, v_period_start, v_expires_at, v_image_limit
  from public.shieldmind_subscriptions as s
  where s.user_id = v_user_id
    and s.status = 'active'
    and s.expires_at > now()
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
    else 0
  end;

  select m.* into v_month_row
  from private.shieldmind_monthly_usage as m
  where m.user_id = v_user_id
    and m.period_start = v_period_start;

  select coalesce(i.upload_count, 0) into v_image_used
  from private.shieldmind_image_usage_windows as i
  where i.user_id = v_user_id
    and i.month_start = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  return query select
    v_plan,
    v_request_limit,
    coalesce(v_month_row.request_count, 0),
    greatest(0, v_request_limit - coalesce(v_month_row.request_count, 0)),
    coalesce(v_month_row.input_tokens, 0),
    coalesce(v_month_row.output_tokens, 0),
    coalesce(v_month_row.estimated_cost_usd, 0),
    v_period_start,
    v_expires_at,
    coalesce(v_image_limit, 0),
    coalesce(v_image_used, 0),
    coalesce(v_month_row.last_model, 'gpt-6-luna');
end;
$function$;

revoke all on function private.get_my_shieldmind_usage_impl() from public, anon;
grant execute on function private.get_my_shieldmind_usage_impl() to authenticated;
