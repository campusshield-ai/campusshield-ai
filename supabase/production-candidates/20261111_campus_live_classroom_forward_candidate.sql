-- PRODUCTION CANDIDATE ONLY
-- Consolidated, forward-only Live Classroom rollout for the current Production schema.
-- This file is executed only by the schema-only disposable PostgreSQL compatibility workflow.
-- Do not apply it directly to either Supabase project; the production migration is prepared separately.

begin;

-- Source: supabase/migrations/20261105022245_campus_live_classroom_sessions.sql
-- CampusShield AI: private, campus-scoped live online class sessions.
-- Staging rollout only. LiveKit credentials stay in Edge Function secrets.

create table if not exists public.campus_live_class_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
  title text not null,
  description text not null default '',
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  livekit_room_name text not null unique,
  external_meeting_url text,
  recording_url text,
  created_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_live_class_sessions_title_length
    check (char_length(btrim(title)) between 3 and 160),
  constraint campus_live_class_sessions_description_length
    check (char_length(description) <= 2000),
  constraint campus_live_class_sessions_external_url_https
    check (external_meeting_url is null or external_meeting_url ~* '^https://[^[:space:]]+$'),
  constraint campus_live_class_sessions_recording_url_https
    check (recording_url is null or recording_url ~* '^https://[^[:space:]]+$')
);

create index if not exists campus_live_class_sessions_classroom_schedule_idx
  on public.campus_live_class_sessions (classroom_id, scheduled_at desc);

create index if not exists campus_live_class_sessions_live_status_idx
  on public.campus_live_class_sessions (status, scheduled_at)
  where status in ('scheduled', 'live');

alter table public.campus_live_class_sessions enable row level security;
revoke all on table public.campus_live_class_sessions from public, anon, authenticated;

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
  if not private.can_manage_class_attendance(p_classroom_id) then
    raise exception 'Only the verified teacher or appointed class assistant can schedule live classes.'
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
           private.can_manage_class_attendance(s.classroom_id)
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
  return private.can_manage_class_attendance(p_classroom_id);
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
  if not private.can_manage_class_attendance(v_classroom_id) then
    raise exception 'Only the teacher or appointed class assistant can start this class.' using errcode = '42501';
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
  if not private.can_manage_class_attendance(v_classroom_id) then
    raise exception 'Only the teacher or appointed class assistant can end this class.' using errcode = '42501';
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
  if not private.can_manage_class_attendance(v_classroom_id) then
    raise exception 'Only the teacher or appointed class assistant can manage this recording link.' using errcode = '42501';
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

-- All data access is through narrow authenticated RPC wrappers.
create or replace function public.create_campus_live_class_session(
  p_classroom_id uuid, p_title text, p_description text,
  p_scheduled_at timestamptz, p_duration_minutes integer,
  p_external_meeting_url text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_campus_live_class_session_impl(
    p_classroom_id, p_title, p_description, p_scheduled_at,
    p_duration_minutes, p_external_meeting_url
  );
$function$;

create or replace function public.list_campus_live_class_sessions(p_classroom_id uuid)
returns table (
  id uuid, classroom_id uuid, title text, description text,
  scheduled_at timestamptz, duration_minutes integer, status text,
  external_meeting_url text, recording_url text,
  started_at timestamptz, ended_at timestamptz, created_at timestamptz,
  can_manage boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.list_campus_live_class_sessions_impl(p_classroom_id);
$function$;

create or replace function public.get_campus_live_classroom_capabilities(p_classroom_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_campus_live_classroom_capabilities_impl(p_classroom_id);
$function$;

create or replace function public.start_campus_live_class_session(p_session_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.start_campus_live_class_session_impl(p_session_id);
$function$;

create or replace function public.end_campus_live_class_session(p_session_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.end_campus_live_class_session_impl(p_session_id);
$function$;

create or replace function public.set_campus_live_class_recording(p_session_id uuid, p_recording_url text)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.set_campus_live_class_recording_impl(p_session_id, p_recording_url);
$function$;

create or replace function public.get_campus_live_class_token_context(p_session_id uuid)
returns table (
  room_name text, session_title text, classroom_title text,
  participant_role text, participant_display_name text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.get_campus_live_class_token_context_impl(p_session_id);
$function$;

grant usage on schema private to authenticated;

revoke all on function private.create_campus_live_class_session_impl(uuid, text, text, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function private.list_campus_live_class_sessions_impl(uuid) from public, anon, authenticated;
revoke all on function private.get_campus_live_classroom_capabilities_impl(uuid) from public, anon, authenticated;
revoke all on function private.start_campus_live_class_session_impl(uuid) from public, anon, authenticated;
revoke all on function private.end_campus_live_class_session_impl(uuid) from public, anon, authenticated;
revoke all on function private.set_campus_live_class_recording_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.get_campus_live_class_token_context_impl(uuid) from public, anon, authenticated;
grant execute on function private.create_campus_live_class_session_impl(uuid, text, text, timestamptz, integer, text) to authenticated;
grant execute on function private.list_campus_live_class_sessions_impl(uuid) to authenticated;
grant execute on function private.get_campus_live_classroom_capabilities_impl(uuid) to authenticated;
grant execute on function private.start_campus_live_class_session_impl(uuid) to authenticated;
grant execute on function private.end_campus_live_class_session_impl(uuid) to authenticated;
grant execute on function private.set_campus_live_class_recording_impl(uuid, text) to authenticated;
grant execute on function private.get_campus_live_class_token_context_impl(uuid) to authenticated;

revoke all on function public.create_campus_live_class_session(uuid, text, text, timestamptz, integer, text) from public, anon;
revoke all on function public.list_campus_live_class_sessions(uuid) from public, anon;
revoke all on function public.get_campus_live_classroom_capabilities(uuid) from public, anon;
revoke all on function public.start_campus_live_class_session(uuid) from public, anon;
revoke all on function public.end_campus_live_class_session(uuid) from public, anon;
revoke all on function public.set_campus_live_class_recording(uuid, text) from public, anon;
revoke all on function public.get_campus_live_class_token_context(uuid) from public, anon;

grant execute on function public.create_campus_live_class_session(uuid, text, text, timestamptz, integer, text) to authenticated;
grant execute on function public.list_campus_live_class_sessions(uuid) to authenticated;
grant execute on function public.get_campus_live_classroom_capabilities(uuid) to authenticated;
grant execute on function public.start_campus_live_class_session(uuid) to authenticated;
grant execute on function public.end_campus_live_class_session(uuid) to authenticated;
grant execute on function public.set_campus_live_class_recording(uuid, text) to authenticated;
grant execute on function public.get_campus_live_class_token_context(uuid) to authenticated;


-- Source: supabase/migrations/20261105024500_index_live_class_session_creator.sql
-- Index the live-session creator foreign key for account cleanup and joins.
create index if not exists campus_live_class_sessions_created_by_idx
  on public.campus_live_class_sessions (created_by);


-- Source: supabase/migrations/20261105102246_campus_admin_live_classroom_access.sql
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


-- Source: supabase/migrations/20261105103142_campus_live_classroom_admin_only_scope.sql
-- Keep campus administrators' expanded access confined to live classes.
-- Restore the shared classroom access helper to its original teacher/assistant/student scope.

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


-- Source: supabase/migrations/20261105105004_campus_admin_classroom_creation.sql
-- Allow verified campus administrators to create and own classrooms
-- only within their active, verified university membership.
--
-- Keep the current Production architecture: SECURITY INVOKER public RPC,
-- with the guarded write implementation in the non-exposed private schema.
-- Do not alter private.can_access_classroom; existing classroom access remains
-- governed by its current campus teacher/admin/student checks.

create or replace function private.create_campus_classroom_impl(
  p_name text,
  p_subject text,
  p_description text default ''
)
returns public.campus_classrooms
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid;
  v_role text;
  v_code text;
  v_class public.campus_classrooms;
begin
  if v_user is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id = v_user
    and p.verification_status = 'verified';

  if v_role is null or v_role not in ('teacher', 'admin') then
    raise exception 'Only verified teachers or campus administrators can create classes.' using errcode = '42501';
  end if;

  select m.university_id into v_university
  from public.campus_memberships m
  join public.campus_universities u on u.id = m.university_id
  where m.user_id = v_user
    and m.membership_status = 'active'
    and m.verification_status = 'verified'
    and (
      (v_role = 'teacher' and m.campus_role = 'teacher')
      or
      (v_role = 'admin' and m.campus_role = 'admin' and u.is_active = true)
    )
  limit 1;

  if v_university is null then
    raise exception 'An active, verified campus membership matching your account role is required to create classes.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 120
     or char_length(btrim(coalesce(p_subject, ''))) not between 2 and 120
     or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Check class name, subject, and description lengths.' using errcode = '22023';
  end if;

  loop
    v_code := 'CSAI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.campus_classrooms where join_code = v_code
    );
  end loop;

  insert into public.campus_classrooms (
    university_id, teacher_id, name, subject, description, join_code
  ) values (
    v_university, v_user, btrim(p_name), btrim(p_subject),
    btrim(coalesce(p_description, '')), v_code
  )
  returning * into v_class;

  return v_class;
end;
$function$;

revoke all on function private.create_campus_classroom_impl(text, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_campus_classroom_impl(text, text, text) to authenticated;

create or replace function public.create_campus_classroom(
  p_name text,
  p_subject text,
  p_description text default ''
)
returns public.campus_classrooms
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  return private.create_campus_classroom_impl(p_name, p_subject, p_description);
end;
$function$;

revoke all on function public.create_campus_classroom(text, text, text) from public, anon;
grant execute on function public.create_campus_classroom(text, text, text) to authenticated;

commit;
