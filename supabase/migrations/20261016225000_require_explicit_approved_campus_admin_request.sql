-- Restrict campus-admin appointment to staff who were approved and explicitly requested consideration.
-- A trusted platform administrator remains the only actor who can perform the appointment.
begin;
create or replace function public.platform_assign_campus_admin(
  p_user_id uuid,
  p_university_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  if not exists (
    select 1
    from public.campus_staff_verifications v
    join public.profiles p on p.id=v.user_id
    join public.campus_memberships cm on cm.user_id=v.user_id and cm.university_id=v.university_id
    join public.campus_universities u on u.id=v.university_id
    where v.user_id=p_user_id
      and v.university_id=p_university_id
      and v.status='approved'
      and v.requested_campus_admin=true
      and p.verification_status='verified'
      and p.role::text='teacher'
      and cm.campus_role='teacher'
      and cm.membership_status='active'
      and cm.verification_status='verified'
      and u.is_active
  ) then
    raise exception 'Only verified staff approved for their university and explicitly requesting campus administrator consideration can be appointed.';
  end if;

  update public.profiles
    set role='admin'
    where id=p_user_id
      and verification_status='verified'
      and role::text='teacher';
  if not found then
    raise exception 'Campus administrator could not be assigned.';
  end if;

  update public.campus_memberships
    set campus_role='admin', updated_at=now()
    where user_id=p_user_id
      and university_id=p_university_id
      and campus_role='teacher'
      and membership_status='active'
      and verification_status='verified';
  if not found then
    raise exception 'Campus administrator membership is not verified for this university.';
  end if;
end;
$function$;
revoke all on function public.platform_assign_campus_admin(uuid,uuid) from public, anon;
grant execute on function public.platform_assign_campus_admin(uuid,uuid) to authenticated;
commit;