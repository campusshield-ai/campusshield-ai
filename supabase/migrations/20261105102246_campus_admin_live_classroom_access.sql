-- Allow verified campus administrators to access and manage live classrooms
-- within their own active, verified university membership only.

create or replace function private.is_verified_campus_admin_for_classroom(p_classroom_id uuid)
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
    join public.campus_universities u
      on u.id = c.university_id
    where c.id = p_classroom_id
      and u.is_active = true
      and p.role = 'admin'
      and p.verification_status = 'verified'
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  );
$function$;

-- Campus admins may read classrooms in their own verified university so the
-- Online Classroom selector can display those classes. Students remain
-- restricted to their own enrollments; teachers and assistants keep existing access.
create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.is_verified_campus_admin_for_classroom(p_classroom_id)
    or exists (
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

-- Dedicated live-class management permission. This intentionally does not
-- expand the separate classroom attendance-management permission.
create or replace function private.can_manage_campus_live_classroom(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.can_manage_class_attendance(p_classroom_id)
    or private.is_verified_campus_admin_for_classroom(p_classroom_id);
$function$;

revoke all on function private.is_verified_campus_admin_for_classroom(uuid) from public, anon, authenticated;
revoke all on function private.can_manage_campus_live_classroom(uuid) from public, anon, authenticated;

create or replace function private.create_campus_live_class_session_impl(
  p_classroom_id uuid,
  p_title text,
  p_description text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_external_meeting_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
  v_room_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;
  if not private.can_manage_campus_live_classroom(p_classroom_id) then
    raise exception 'Only a verified teacher, appointed class assistant or campus administrator for this university can schedule live classes.'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160 then
    raise exception 'Class title must be 3–160 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 then
    raise exception 'Class description is too long.' using errcode = '22023';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '10 minutes' then
    raise exception 'Choose a valid class date and time.' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 15 and 240 then
    raise exception 'Class duration must be between 15 and 240 minutes.' using errcode = '22023';
  end if;
  if p_external_meeting_url is not null and (
    char_length(p_external_meeting_url) > 2048 or
    p_external_meeting_url !~* '^https://[^[:space:]]+$'
  ) then
    raise exception 'External class links must use HTTPS.' using errcode = '22023';
  end if;

  v_room_name := 'csai-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.campus_live_class_sessions (
    classroom_id, title, description, scheduled_at, duration_minutes,
    livekit_room_name, external_meeting_url, created_by
  ) values (
    p_classroom_id, btrim(p_title), coalesce(p_description, ''),
    p_scheduled_at, p_duration_minutes, v_room_name,
    nullif(btrim(coalesce(p_external_meeting_url, '')), ''), (select auth.uid())
  ) returning id into v_session_id;

  return v_session_id;
end;
$function$;

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
  if not private.can_access_classroom(p_classroom_id) then
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
  if not private.can_access_classroom(p_classroom_id) then
    raise exception 'This classroom is not available to your account.' using errcode = '42501';
  end if;
  return private.can_manage_campus_live_classroom(p_classroom_id);
end;
$function$;

create or replace function private.start_campus_live_class_session_impl(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_classroom_id uuid;
  v_result uuid;
begin
  select classroom_id into v_classroom_id
  from public.campus_live_class_sessions
  where id = p_session_id;
  if v_classroom_id is null then
    raise exception 'Live class not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_campus_live_classroom(v_classroom_id) then
    raise exception 'Only the verified teacher, appointed class assistant or campus administrator can start this class.' using errcode = '42501';
  end if;

  update public.campus_live_class_sessions
  set status = 'live', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_session_id and status = 'scheduled'
  returning id into v_result;

  if v_result is null then
    raise exception 'This class is not in a scheduled state.' using errcode = '22023';
  end if;
  return v_result;
end;
$function$;

create or replace function private.end_campus_live_class_session_impl(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_classroom_id uuid;
  v_result uuid;
begin
  select classroom_id into v_classroom_id
  from public.campus_live_class_sessions
  where id = p_session_id;
  if v_classroom_id is null then
    raise exception 'Live class not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_campus_live_classroom(v_classroom_id) then
    raise exception 'Only the verified teacher, appointed class assistant or campus administrator can end this class.' using errcode = '42501';
  end if;

  update public.campus_live_class_sessions
  set status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = p_session_id and status in ('scheduled', 'live')
  returning id into v_result;

  if v_result is null then
    raise exception 'This class has already ended or was cancelled.' using errcode = '22023';
  end if;
  return v_result;
end;
$function$;

create or replace function private.set_campus_live_class_recording_impl(
  p_session_id uuid,
  p_recording_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_classroom_id uuid;
  v_status text;
  v_result uuid;
begin
  select classroom_id, status into v_classroom_id, v_status
  from public.campus_live_class_sessions
  where id = p_session_id;
  if v_classroom_id is null then
    raise exception 'Live class not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_campus_live_classroom(v_classroom_id) then
    raise exception 'Only the verified teacher, appointed class assistant or campus administrator can manage this recording link.' using errcode = '42501';
  end if;
  if v_status <> 'ended' then
    raise exception 'Add a recording link after the live class has ended.' using errcode = '22023';
  end if;
  if p_recording_url is not null and (
    char_length(p_recording_url) > 2048 or
    p_recording_url !~* '^https://[^[:space:]]+$'
  ) then
    raise exception 'Recording links must use HTTPS.' using errcode = '22023';
  end if;

  update public.campus_live_class_sessions
  set recording_url = nullif(btrim(coalesce(p_recording_url, '')), ''), updated_at = now()
  where id = p_session_id
  returning id into v_result;
  return v_result;
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

  if v_classroom_id is null or not private.can_access_classroom(v_classroom_id) or v_status <> 'live' then
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

-- Private helpers are only callable by their definer-owned implementations.
