-- Let verified staff see all Live Classroom classrooms covered by their active,
-- verified campus memberships. The previous single-current-campus lookup could
-- hide valid classrooms when an admin/lecturer belongs to more than one campus.
--
-- Per-class authorization remains enforced by can_access_live_classroom:
-- lecturers see their assigned classrooms, campus admins see classrooms only
-- at their own active, verified university, and students see only their classes.

create or replace function private.list_campus_live_classrooms_impl()
returns table (
  id uuid,
  university_id uuid,
  name text,
  subject text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in with a verified campus account to view online classes.'
      using errcode = '42501';
  end if;

  return query
    select c.id, c.university_id, c.name, c.subject, c.description, c.created_at, c.updated_at
    from public.campus_classrooms c
    where exists (
      select 1
      from public.campus_memberships m
      where m.user_id = (select auth.uid())
        and m.university_id = c.university_id
        and m.membership_status = 'active'
        and m.verification_status = 'verified'
    )
      and private.can_access_live_classroom(c.id)
    order by c.created_at desc
    limit 100;
end;
$function$;

revoke all on function private.list_campus_live_classrooms_impl() from public, anon, authenticated;
grant execute on function private.list_campus_live_classrooms_impl() to authenticated;
