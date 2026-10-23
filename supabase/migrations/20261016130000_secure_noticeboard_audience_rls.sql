-- The public notice policy must not require clients to read campus_memberships directly.
-- Use a narrowly scoped private helper instead of broadening membership-table grants.

begin;

create or replace function private.current_user_matches_notice_audience(
  p_university_id uuid,
  p_audience_scope text,
  p_target_faculty text,
  p_target_department text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.campus_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.university_id = p_university_id
      and cm.membership_status = 'active'
      and (
        p_audience_scope = 'campus'
        or (
          p_audience_scope = 'faculty'
          and cm.faculty = p_target_faculty
        )
        or (
          p_audience_scope = 'department'
          and cm.faculty = p_target_faculty
          and cm.department = p_target_department
        )
      )
  );
$function$;

revoke all on function private.current_user_matches_notice_audience(uuid,text,text,text) from public, anon;
grant execute on function private.current_user_matches_notice_audience(uuid,text,text,text) to authenticated, service_role;

drop policy if exists campus_notices_read_published_for_campus_audience
  on public.campus_notices;
create policy campus_notices_read_published_for_campus_audience
on public.campus_notices
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and status = 'published'
  and (expires_at is null or expires_at > now())
  and (
    coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
    or (select private.current_user_matches_notice_audience(
      campus_notices.university_id,
      campus_notices.audience_scope,
      campus_notices.target_faculty,
      campus_notices.target_department
    ))
  )
);

commit;
