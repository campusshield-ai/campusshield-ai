-- Use one narrow helper to evaluate both university and group membership
-- without requiring direct REST table grants on campus_groups or campus_group_members.
create or replace function private.can_read_campus_course_community_messages(
  p_group_id uuid,
  p_course_id uuid,
  p_university_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_university_id=(select private.current_campus_university_id())
    and coalesce((select private.current_user_has_verified_campus_access()),false)
    and exists (
      select 1
      from public.campus_groups g
      where g.id=p_group_id
        and g.course_id=p_course_id
        and g.university_id=p_university_id
        and g.status='active'
        and (
          exists (
            select 1 from public.campus_group_members gm
            where gm.group_id=g.id and gm.user_id=(select auth.uid())
          )
          or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
        )
    );
$function$;

revoke all on function private.can_read_campus_course_community_messages(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_read_campus_course_community_messages(uuid,uuid,uuid) to authenticated;

drop policy if exists campus_course_community_messages_read_members on public.campus_course_community_messages;
create policy campus_course_community_messages_read_members
  on public.campus_course_community_messages for select to authenticated
  using (
    status='published'
    and (select private.can_read_campus_course_community_messages(
      group_id,course_id,university_id
    ))
  );
