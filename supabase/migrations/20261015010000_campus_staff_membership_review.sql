-- Campus-scoped staff verification and one-time bootstrap for the first campus administrator.
begin;

create or replace function public.bootstrap_first_campus_admin(p_university_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_status text;
  v_existing_university uuid;
begin
  select p.role::text, p.verification_status::text
    into v_role, v_status
  from public.profiles p where p.id = v_user_id;

  if v_user_id is null or v_role is distinct from 'admin' or v_status is distinct from 'verified' then
    raise exception 'Only the verified CampusShield platform administrator can initialize the first campus administrator.';
  end if;

  if exists (
    select 1 from public.campus_memberships cm
    join public.profiles p on p.id = cm.user_id
    where cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and p.role = 'admin'
      and p.verification_status = 'verified'
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id = p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  select cm.university_id into v_existing_university
  from public.campus_memberships cm where cm.user_id = v_user_id;

  if found and v_existing_university <> p_university_id then
    raise exception 'Your campus selection is locked. Contact support for a transfer.';
  end if;

  insert into public.campus_memberships
    (user_id, university_id, membership_status, verification_status)
  values (v_user_id, p_university_id, 'active', 'verified')
  on conflict (user_id) do update
    set verification_status = 'verified', membership_status = 'active', updated_at = now()
    where public.campus_memberships.university_id = excluded.university_id;

  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id and cm.university_id = p_university_id
      and cm.membership_status = 'active' and cm.verification_status = 'verified'
  ) then
    raise exception 'Campus administrator bootstrap failed; contact support.';
  end if;
  return true;
end;
$function$;

create or replace function public.list_campus_staff_membership_reviews()
returns table (
  user_id uuid,
  username text,
  requested_role text,
  account_role text,
  account_status text,
  campus_status text,
  faculty text,
  department text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(private.current_campus_role(),'') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;

  return query
    select p.id, cp.username, p.requested_role::text, p.role::text,
      p.verification_status::text, cm.verification_status::text, cm.faculty, cm.department, cm.created_at
    from public.campus_memberships cm
    join public.profiles p on p.id = cm.user_id
    left join public.community_profiles cp on cp.user_id = p.id
    where cm.university_id = (select private.current_campus_university_id())
      and cm.membership_status = 'active'
      and cm.verification_status in ('unverified','pending')
      and (p.requested_role = 'teacher' or p.role in ('teacher','security','admin'))
    order by cm.created_at;
end;
$function$;

create or replace function public.review_campus_staff_membership(
  p_user_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text;
  v_requested_role text;
begin
  if coalesce(private.current_campus_role(),'') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select p.role::text, p.requested_role::text
    into v_role, v_requested_role
  from public.profiles p
  join public.campus_memberships cm on cm.user_id = p.id
  where p.id = p_user_id
    and cm.university_id = (select private.current_campus_university_id())
    and cm.membership_status = 'active'
    and cm.verification_status in ('unverified','pending')
    and (p.requested_role = 'teacher' or p.role in ('teacher','security','admin'));

  if not found then
    raise exception 'This staff membership request is not in your university queue.';
  end if;

  update public.campus_memberships
    set verification_status = case p_decision when 'approve' then 'verified' else 'rejected' end,
        updated_at = now()
  where user_id = p_user_id
    and university_id = (select private.current_campus_university_id())
    and membership_status = 'active';
  if not found then raise exception 'Campus membership could not be updated.'; end if;
end;
$function$;

revoke all on function public.bootstrap_first_campus_admin(uuid) from public, anon;
revoke all on function public.list_campus_staff_membership_reviews() from public, anon;
revoke all on function public.review_campus_staff_membership(uuid,text) from public, anon;
grant execute on function public.bootstrap_first_campus_admin(uuid) to authenticated;
grant execute on function public.list_campus_staff_membership_reviews() to authenticated;
grant execute on function public.review_campus_staff_membership(uuid,text) to authenticated;

commit;
