-- Use a narrow SECURITY DEFINER membership helper from the message RLS policy.
-- This avoids granting students broad direct SELECT access to campus_group_members.

create or replace function private.current_user_is_campus_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.campus_group_members gm
    where gm.group_id=p_group_id
      and gm.user_id=(select auth.uid())
  );
$function$;

revoke all on function private.current_user_is_campus_group_member(uuid) from public,anon,authenticated;
grant execute on function private.current_user_is_campus_group_member(uuid) to authenticated;

drop policy if exists campus_course_community_messages_read_members on public.campus_course_community_messages;
create policy campus_course_community_messages_read_members
  on public.campus_course_community_messages for select to authenticated
  using (
    university_id=(select private.current_campus_university_id())
    and status='published'
    and (select private.current_user_has_verified_campus_access())
    and exists (
      select 1 from public.campus_groups g
      where g.id=campus_course_community_messages.group_id
        and g.course_id=campus_course_community_messages.course_id
        and g.university_id=campus_course_community_messages.university_id
        and g.status='active'
        and (
          (select private.current_user_is_campus_group_member(g.id))
          or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
        )
    )
  );
