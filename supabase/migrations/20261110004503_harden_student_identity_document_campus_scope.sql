-- Prevent verified administrators from reading student identity documents
-- belonging to other universities. Students retain access to their own files.
-- The dedicated platform-owner storage policy remains unchanged.

create or replace function private.can_read_student_identity_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.profiles as administrator
      join public.campus_memberships as administrator_membership
        on administrator_membership.user_id = administrator.id
      join public.campus_memberships as student_membership
        on student_membership.university_id = administrator_membership.university_id
      where administrator.id = (select auth.uid())
        and administrator.role = 'admin'
        and administrator.verification_status = 'verified'
        and administrator_membership.campus_role = 'admin'
        and administrator_membership.membership_status = 'active'
        and administrator_membership.verification_status = 'verified'
        and student_membership.user_id = p_user_id
        and student_membership.membership_status = 'active'
    );
$function$;

-- This helper is internal to Storage RLS: no public or anonymous invocation.
revoke all on function private.can_read_student_identity_for_user(uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_student_identity_for_user(uuid)
  to authenticated;

drop policy if exists student_identity_read_own_or_verified_admin
  on storage.objects;
drop policy if exists student_identity_read_own_or_campus_admin
  on storage.objects;

create policy student_identity_read_own_or_campus_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-identity-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.student_identity_verifications as verification
      where verification.object_path = objects.name
        and private.can_read_student_identity_for_user(verification.user_id)
    )
  )
);
