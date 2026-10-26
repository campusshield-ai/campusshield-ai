-- Avoid RLS policy lookups that require browser users to have direct
-- SELECT privileges on campus_memberships. Evaluate campus-admin scope in a
-- narrowly granted SECURITY DEFINER helper instead.
begin;

create or replace function private.can_read_campus_feedback(p_university_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select public.platform_is_admin()), false)
    or (
      exists (
        select 1
        from public.profiles actor
        where actor.id = (select auth.uid())
          and actor.role = 'admin'
          and actor.verification_status = 'verified'
      )
      and p_university_id is not null
      and exists (
        select 1
        from public.campus_memberships cm
        where cm.user_id = (select auth.uid())
          and cm.university_id = p_university_id
          and cm.membership_status = 'active'
          and cm.verification_status = 'verified'
          and cm.campus_role = 'admin'
      )
    );
$function$;

revoke all on function private.can_read_campus_feedback(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_read_campus_feedback(uuid) to authenticated;

drop policy if exists campus_user_feedback_read_own_or_authorized_admin
  on public.campus_user_feedback;

create policy campus_user_feedback_read_own_or_authorized_admin
  on public.campus_user_feedback
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or coalesce((select private.can_read_campus_feedback(university_id)), false)
  );

commit;
