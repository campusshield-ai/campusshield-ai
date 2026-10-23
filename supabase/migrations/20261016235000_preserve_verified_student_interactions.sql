-- Existing verified student accounts may predate the student identity-verification table.
-- Trust the authoritative verified profile + active verified campus membership instead of
-- requiring a second identity row for every existing student.
begin;

create or replace function private.current_user_has_verified_campus_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.verification_status = 'verified'
      and (
        (
          (p.requested_role = 'student' or p.role = 'student')
          and coalesce((select private.current_campus_role()), '') = 'student'
        )
        or (
          p.role in ('teacher','security','admin')
          and coalesce((select private.current_campus_role()), '') in ('teacher','security','admin')
        )
      )
  );
$function$;

revoke all on function private.current_user_has_verified_campus_access() from public, anon;
grant execute on function private.current_user_has_verified_campus_access() to authenticated, service_role;

commit;
