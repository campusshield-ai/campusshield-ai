-- ShieldMind personal timetable + server-enforced paid study-image allowances.
-- Each planner record belongs to one authenticated account; quota counters remain private.

create table if not exists public.shieldmind_planner_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  kind text not null default 'revision' check (kind in ('revision','class','assignment','exam','reminder')),
  details text not null default '' check (char_length(details) <= 1000),
  starts_at timestamptz,
  remind_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shieldmind_planner_items_owner_schedule_idx
  on public.shieldmind_planner_items(user_id, starts_at nulls last, remind_at nulls last);
alter table public.shieldmind_planner_items enable row level security;
revoke all on table public.shieldmind_planner_items from public, anon;
grant select, insert, update, delete on table public.shieldmind_planner_items to authenticated;
drop policy if exists shieldmind_planner_select_own on public.shieldmind_planner_items;
create policy shieldmind_planner_select_own on public.shieldmind_planner_items
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists shieldmind_planner_insert_own on public.shieldmind_planner_items;
create policy shieldmind_planner_insert_own on public.shieldmind_planner_items
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists shieldmind_planner_update_own on public.shieldmind_planner_items;
create policy shieldmind_planner_update_own on public.shieldmind_planner_items
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists shieldmind_planner_delete_own on public.shieldmind_planner_items;
create policy shieldmind_planner_delete_own on public.shieldmind_planner_items
  for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists private.shieldmind_image_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start timestamptz not null,
  upload_count integer not null default 0 check (upload_count >= 0),
  primary key (user_id, month_start)
);
revoke all on table private.shieldmind_image_usage_windows from public, anon, authenticated;

create or replace function public.consume_shieldmind_image_upload()
returns table(allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_month_start timestamptz := date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_limit integer := 0;
  v_count integer;
begin
  if v_user_id is null then return query select false, 0; return; end if;
  select coalesce(s.image_upload_limit,0) into v_limit
    from public.shieldmind_subscriptions s
    where s.user_id = v_user_id and s.status = 'active' and s.expires_at > v_now
      and s.plan in ('starter','plus','pro','ultra','max','premium')
    limit 1;
  if coalesce(v_limit,0) <= 0 then return query select false, 0; return; end if;
  insert into private.shieldmind_image_usage_windows(user_id,month_start,upload_count)
    values(v_user_id,v_month_start,1)
    on conflict(user_id,month_start)
    do update set upload_count = private.shieldmind_image_usage_windows.upload_count + 1
      where private.shieldmind_image_usage_windows.upload_count < v_limit
    returning upload_count into v_count;
  if not found then return query select false, 0; return; end if;
  delete from private.shieldmind_image_usage_windows where month_start < v_now - interval '62 days';
  return query select true, greatest(0,v_limit-v_count);
end;
$function$;
revoke all on function public.consume_shieldmind_image_upload() from public, anon, authenticated;
grant execute on function public.consume_shieldmind_image_upload() to authenticated;
