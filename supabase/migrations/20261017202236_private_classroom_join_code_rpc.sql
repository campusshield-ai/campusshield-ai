-- Store join-code access behind a private, owner-checked implementation.
begin;
-- Keep the join-code privilege implementation in the non-exposed private schema.
-- The public RPC is an invoker wrapper and remains guarded by the private implementation.
create or replace function private.get_campus_classroom_join_code_impl(p_classroom_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.campus_memberships m on m.user_id = p.id
    join public.campus_classrooms c on c.university_id = m.university_id
    where p.id = v_user
      and c.id = p_classroom_id
      and c.teacher_id = v_user
      and p.role = 'teacher'
      and p.verification_status = 'verified'
      and m.campus_role = 'teacher'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  ) then
    raise exception 'Only the verified class teacher can view this join code.' using errcode = '42501';
  end if;

  select c.join_code into v_code
  from public.campus_classrooms c
  where c.id = p_classroom_id and c.teacher_id = v_user;

  if v_code is null then
    raise exception 'Classroom not found.' using errcode = 'P0002';
  end if;

  return v_code;
end;
$function$;

revoke all on function private.get_campus_classroom_join_code_impl(uuid) from public, anon;
grant execute on function private.get_campus_classroom_join_code_impl(uuid) to authenticated;

create or replace function public.get_campus_classroom_join_code(p_classroom_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.get_campus_classroom_join_code_impl(p_classroom_id);
$function$;

revoke all on function public.get_campus_classroom_join_code(uuid) from public, anon;
grant execute on function public.get_campus_classroom_join_code(uuid) to authenticated;

commit;
