-- A platform administrator must be provisioned by a trusted database owner.
-- A global profile role alone must never allow a user to claim platform-wide permissions.
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
  select p.role::text,p.verification_status::text
    into v_role,v_status
  from public.profiles p where p.id=v_user_id;

  if v_user_id is null or v_role is distinct from 'admin' or v_status is distinct from 'verified' then
    raise exception 'A verified CampusShield administrator is required.';
  end if;

  if not exists (
    select 1 from private.platform_admins pa where pa.user_id=v_user_id
  ) then
    raise exception 'Trusted platform administrator access must be provisioned by the database owner before campus setup.';
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id=p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  select cm.university_id into v_existing_university
  from public.campus_memberships cm where cm.user_id=v_user_id;

  if found and v_existing_university <> p_university_id then
    raise exception 'Your campus selection is locked. Use platform administration to assign a separate campus administrator.';
  end if;

  if exists (
    select 1 from public.campus_memberships cm
    where cm.university_id=p_university_id
      and cm.campus_role='admin'
      and cm.user_id<>v_user_id
      and cm.membership_status='active'
      and cm.verification_status='verified'
  ) then
    raise exception 'This university already has an approved campus administrator.';
  end if;

  insert into public.campus_memberships
    (user_id,university_id,campus_role,membership_status,verification_status)
  values
    (v_user_id,p_university_id,'admin','active','verified')
  on conflict(user_id) do update
    set campus_role='admin',
        membership_status='active',
        verification_status='verified',
        updated_at=now()
    where public.campus_memberships.university_id=excluded.university_id;

  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=v_user_id
      and cm.university_id=p_university_id
      and cm.campus_role='admin'
      and cm.membership_status='active'
      and cm.verification_status='verified'
  ) then
    raise exception 'Campus administrator setup failed; contact support.';
  end if;
  return true;
end;
$function$;

revoke all on function public.bootstrap_first_campus_admin(uuid) from public, anon;
grant execute on function public.bootstrap_first_campus_admin(uuid) to authenticated;

commit;
