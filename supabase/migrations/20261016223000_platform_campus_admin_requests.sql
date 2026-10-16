-- Surface approved senior-staff requests to the trusted platform admin for explicit campus assignment.
begin;
create or replace function public.platform_list_campus_admin_requests()
returns table (
  user_id uuid,
  username text,
  university_id uuid,
  university_name text,
  position_title text,
  official_email text,
  created_at timestamptz
)
language plpgsql
stable
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
  return query
    select v.user_id, cp.username, v.university_id, u.name, v.position_title,
           v.official_email, v.created_at
    from public.campus_staff_verifications v
    join public.profiles p on p.id=v.user_id
    join public.campus_memberships cm on cm.user_id=v.user_id and cm.university_id=v.university_id
    join public.campus_universities u on u.id=v.university_id
    left join public.community_profiles cp on cp.user_id=v.user_id
    where v.status='approved'
      and v.requested_campus_admin
      and p.role::text='teacher'
      and p.verification_status='verified'
      and cm.campus_role='teacher'
      and cm.membership_status='active'
      and cm.verification_status='verified'
    order by v.created_at asc;
end;
$function$;
revoke all on function public.platform_list_campus_admin_requests() from public, anon;
grant execute on function public.platform_list_campus_admin_requests() to authenticated;
commit;
