-- Keep campus administrators' expanded access confined to live classes.
-- Restore the shared classroom access helper to its original teacher/assistant/student scope.

create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.campus_classrooms c
    join public.profiles p on p.id = (select auth.uid())
    join public.campus_memberships m
      on m.user_id = p.id
     and m.university_id = c.university_id
    where c.id = p_classroom_id
      and p.verification_status = 'verified'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
      and (
        (
          c.teacher_id = p.id
          and p.role = 'teacher'
          and m.campus_role = 'teacher'
        )
        or (
          c.assistant_student_id = p.id
          and p.role = 'student'
          and m.campus_role = 'student'
        )
        or (
          p.role = 'student'
          and m.campus_role = 'student'
          and exists (
            select 1
            from public.campus_classroom_enrollments e
            where e.classroom_id = c.id
              and e.student_id = p.id
          )
        )
      )
  );
$function$;

-- Dedicated visibility helper for the live classroom only. Admin access is
-- tied to an active, verified admin membership at the classroom's university.
create or replace function private.can_access_live_classroom(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.can_access_classroom(p_classroom_id)
    or private.is_verified_campus_admin_for_classroom(p_classroom_id);
$function$;

revoke all on function private.can_access_live_classroom(uuid) from public, anon, authenticated;
grant execute on function private.can_access_live_classroom(uuid) to authenticated;

-- Admins need a selector for live sessions, not broader access to general
-- classroom resources such as announcements, rosters or course materials.
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
  if (select auth.uid()) is null or (select private.current_campus_university_id()) is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;

  return query
    select c.id, c.university_id, c.name, c.subject, c.description, c.created_at, c.updated_at
    from public.campus_classrooms c
    where c.university_id = (select private.current_campus_university_id())
      and private.can_access_live_classroom(c.id)
    order by c.created_at desc
    limit 100;
end;
$function$;

create or replace function public.list_campus_live_classrooms()
returns table (
  id uuid,
  university_id uuid,
  name text,
  subject text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_campus_live_classrooms_impl();
$function$;

revoke all on function private.list_campus_live_classrooms_impl() from public, anon, authenticated;
grant execute on function private.list_campus_live_classrooms_impl() to authenticated;
revoke all on function public.list_campus_live_classrooms() from public, anon;
grant execute on function public.list_campus_live_classrooms() to authenticated;

-- Change only the live-session readers/token context to use the dedicated
-- live-class visibility rule. Teacher/student enrollment rules remain in place.
create or replace function private.list_campus_live_class_sessions_impl(p_classroom_id uuid)
returns table (
  id uuid,
  classroom_id uuid,
  title text,
  description text,
  scheduled_at timestamptz,
  duration_minutes integer,
  status text,
  external_meeting_url text,
  recording_url text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_access_live_classroom(p_classroom_id) then
    raise exception 'This classroom is not available to your account.' using errcode = '42501';
  end if;

  return query
    select s.id, s.classroom_id, s.title, s.description, s.scheduled_at,
           s.duration_minutes, s.status, s.external_meeting_url, s.recording_url,
           s.started_at, s.ended_at, s.created_at,
           private.can_manage_campus_live_classroom(s.classroom_id)
    from public.campus_live_class_sessions s
    where s.classroom_id = p_classroom_id
    order by
      case s.status when 'live' then 0 when 'scheduled' then 1 else 2 end,
      s.scheduled_at desc;
end;
$function$;

create or replace function private.get_campus_live_classroom_capabilities_impl(p_classroom_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.can_access_live_classroom(p_classroom_id) then
    raise exception 'This classroom is not available to your account.' using errcode = '42501';
  end if;
  return private.can_manage_campus_live_classroom(p_classroom_id);
end;
$function$;

create or replace function private.get_campus_live_class_token_context_impl(p_session_id uuid)
returns table (
  room_name text,
  session_title text,
  classroom_title text,
  participant_role text,
  participant_display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_classroom_id uuid;
  v_teacher_id uuid;
  v_assistant_id uuid;
  v_status text;
begin
  select s.classroom_id, c.teacher_id, c.assistant_student_id, s.status,
         s.livekit_room_name, s.title, c.name
    into v_classroom_id, v_teacher_id, v_assistant_id, v_status,
         room_name, session_title, classroom_title
  from public.campus_live_class_sessions s
  join public.campus_classrooms c on c.id = s.classroom_id
  where s.id = p_session_id;

  if v_classroom_id is null or not private.can_access_live_classroom(v_classroom_id) or v_status <> 'live' then
    raise exception 'This live class is not currently available to your account.' using errcode = '42501';
  end if;

  participant_role := case
    when private.is_verified_campus_admin_for_classroom(v_classroom_id) then 'admin'
    when v_teacher_id = (select auth.uid()) then 'teacher'
    when v_assistant_id = (select auth.uid()) then 'assistant'
    else 'student'
  end;

  select coalesce(nullif(btrim(p.display_name), ''), 'Campus member')
    into participant_display_name
  from public.profiles p
  where p.id = (select auth.uid());

  return next;
end;
$function$;
