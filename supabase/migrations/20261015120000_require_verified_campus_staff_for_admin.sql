-- Require the institution membership itself to be verified before assigning campus administrators.
begin;

create or replace function public.platform_list_campus_staff_candidates(p_university_id uuid)
returns table(
  user_id uuid,
  username text,
  account_role text,
  account_status text,
  campus_status text,
  faculty text,
  department text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id=p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  return query
    select p.id, cp.username, p.role::text, p.verification_status::text,
           cm.verification_status::text, cm.faculty, cm.department
    from public.campus_memberships cm
    join public.profiles p on p.id=cm.user_id
    left join public.community_profiles cp on cp.user_id=p.id
    where cm.university_id=p_university_id
      and cm.membership_status='active'
      and cm.verification_status='verified'
      and p.verification_status='verified'
      and p.role::text in ('teacher','security','admin')
    order by cp.username;
end;
$function$;

create or replace function public.platform_assign_campus_admin(p_user_id uuid,p_university_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id=p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.campus_memberships cm on cm.user_id=p.id
    where p.id=p_user_id
      and p.verification_status='verified'
      and p.role::text in ('teacher','security','admin')
      and cm.university_id=p_university_id
      and cm.membership_status='active'
      and cm.verification_status='verified'
  ) then
    raise exception 'Choose staff whose account and membership are verified for the selected university.';
  end if;

  update public.profiles set role='admin' where id=p_user_id;
  if not found then raise exception 'Campus administrator could not be assigned.'; end if;

  update public.campus_memberships
    set campus_role='admin',updated_at=now()
    where user_id=p_user_id
      and university_id=p_university_id
      and membership_status='active'
      and verification_status='verified';
  if not found then raise exception 'Campus administrator membership is not verified for this university.'; end if;
end;
$function$;

revoke all on function public.platform_list_campus_staff_candidates(uuid) from public, anon;
revoke all on function public.platform_assign_campus_admin(uuid,uuid) from public, anon;
grant execute on function public.platform_list_campus_staff_candidates(uuid) to authenticated;
grant execute on function public.platform_assign_campus_admin(uuid,uuid) to authenticated;

commit;
