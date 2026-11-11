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
