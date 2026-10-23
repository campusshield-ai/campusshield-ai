-- Apply server-side eligibility checks to every planner and paid image quota RPC.
-- The browser gate is UX only; these checks run inside trusted SECURITY DEFINER functions.

create or replace function private.shieldmind_require_eligible_caller()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_requested_role text;
  v_university_id uuid;
  v_membership_status text;
  v_membership_verification text;
  v_identity_status text;
  v_identity_university_id uuid;
  v_confirmed_fraud boolean;
  v_fraud_lock_at timestamptz;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select p.role, p.requested_role
    into v_role, v_requested_role
    from public.profiles p
    where p.id = v_uid and p.verification_status = 'verified';
  if not found then raise exception 'A verified campus account is required'; end if;

  select c.university_id, c.membership_status, c.verification_status
    into v_university_id, v_membership_status, v_membership_verification
    from public.get_my_campus_context() c
    limit 1;
  if v_university_id is null
     or v_membership_status <> 'active'
     or v_membership_verification <> 'verified' then
    raise exception 'An active verified campus membership is required';
  end if;

  if coalesce(v_requested_role, v_role) = 'student' then
    select s.status, s.university_id, coalesce(s.confirmed_fraud,false), s.fraud_lock_at
      into v_identity_status, v_identity_university_id, v_confirmed_fraud, v_fraud_lock_at
      from public.student_identity_verifications s
      where s.user_id = v_uid
      limit 1;
    if not found or v_identity_status <> 'approved'
       or v_identity_university_id is distinct from v_university_id
       or v_confirmed_fraud or v_fraud_lock_at is not null then
      raise exception 'Approved student identity for the active campus is required';
    end if;
  end if;
end;
$function$;
revoke all on function private.shieldmind_require_eligible_caller() from public, anon, authenticated;

create or replace function public.list_my_shieldmind_planner_items()
returns table(id uuid,title text,kind text,details text,starts_at timestamptz,remind_at timestamptz,completed boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = ''
as $function$
  select p.id,p.title,p.kind,p.details,p.starts_at,p.remind_at,p.completed,p.created_at,p.updated_at
  from public.shieldmind_planner_items p
  where auth.uid() is not null
    and (select private.shieldmind_require_eligible_caller()) is null
    and p.user_id = auth.uid()
  order by p.starts_at nulls last,p.created_at desc
  limit 100
$function$;

create or replace function public.create_my_shieldmind_planner_item(
  p_title text,p_kind text,p_details text default '',p_starts_at timestamptz default null,p_remind_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
  perform private.shieldmind_require_eligible_caller();
  if char_length(btrim(coalesce(p_title,''))) < 2 or char_length(btrim(p_title)) > 120 then raise exception 'Title must be 2–120 characters'; end if;
  if coalesce(p_kind,'revision') not in ('revision','class','assignment','exam','reminder') then raise exception 'Invalid planner item type'; end if;
  if char_length(coalesce(p_details,'')) > 1000 then raise exception 'Notes are too long'; end if;
  insert into public.shieldmind_planner_items(user_id,title,kind,details,starts_at,remind_at)
    values(auth.uid(),btrim(p_title),coalesce(p_kind,'revision'),coalesce(p_details,''),p_starts_at,p_remind_at)
    returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.update_my_shieldmind_planner_item(p_item_id uuid,p_completed boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.shieldmind_require_eligible_caller();
  update public.shieldmind_planner_items set completed=coalesce(p_completed,false),updated_at=now()
    where id=p_item_id and user_id=auth.uid();
  return found;
end;
$function$;

create or replace function public.delete_my_shieldmind_planner_item(p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.shieldmind_require_eligible_caller();
  delete from public.shieldmind_planner_items where id=p_item_id and user_id=auth.uid();
  return found;
end;
$function$;

create or replace function public.consume_shieldmind_image_upload()
returns table(allowed boolean, remaining integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_month_start timestamptz := date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_limit integer := 0;
  v_count integer;
begin
  perform private.shieldmind_require_eligible_caller();
  if v_user_id is null then return query select false,0; return; end if;
  select coalesce(s.image_upload_limit,0) into v_limit
    from public.shieldmind_subscriptions s
    where s.user_id=v_user_id and s.status='active' and s.expires_at>v_now
      and s.plan in ('starter','plus','pro','ultra','max','premium')
    limit 1;
  if coalesce(v_limit,0)<=0 then return query select false,0; return; end if;
  insert into private.shieldmind_image_usage_windows(user_id,month_start,upload_count)
    values(v_user_id,v_month_start,1)
    on conflict(user_id,month_start)
    do update set upload_count=private.shieldmind_image_usage_windows.upload_count+1
      where private.shieldmind_image_usage_windows.upload_count<v_limit
    returning upload_count into v_count;
  if not found then return query select false,0; return; end if;
  delete from private.shieldmind_image_usage_windows where month_start < v_now - interval '62 days';
  return query select true,greatest(0,v_limit-v_count);
end;
$function$;

revoke all on function public.list_my_shieldmind_planner_items() from public, anon, authenticated;
revoke all on function public.create_my_shieldmind_planner_item(text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.update_my_shieldmind_planner_item(uuid,boolean) from public, anon, authenticated;
revoke all on function public.delete_my_shieldmind_planner_item(uuid) from public, anon, authenticated;
revoke all on function public.consume_shieldmind_image_upload() from public, anon, authenticated;
grant execute on function public.list_my_shieldmind_planner_items() to authenticated;
grant execute on function public.create_my_shieldmind_planner_item(text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.update_my_shieldmind_planner_item(uuid,boolean) to authenticated;
grant execute on function public.delete_my_shieldmind_planner_item(uuid) to authenticated;
grant execute on function public.consume_shieldmind_image_upload() to authenticated;
