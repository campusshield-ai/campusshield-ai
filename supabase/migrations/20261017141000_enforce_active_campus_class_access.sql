-- Require an active membership at the classroom's campus for every classroom read,
-- and require an active campus membership before assigning a Class Assistant.
create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.campus_classrooms c
    join public.profiles p on p.id = (select auth.uid())
    join public.campus_memberships m on m.user_id = p.id and m.university_id = c.university_id
    where c.id = p_classroom_id
      and p.verification_status = 'verified'
      and m.membership_status = 'active'
      and (
        c.teacher_id = p.id
        or c.assistant_student_id = p.id
        or exists (
          select 1 from public.campus_classroom_enrollments e
          where e.classroom_id = c.id and e.student_id = p.id
        )
      )
  );
$$;

create or replace function public.set_campus_class_assistant(p_classroom_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_university uuid;
begin
  if not private.is_verified_classroom_teacher(p_classroom_id) then
    raise exception 'Only the verified class teacher can appoint or remove an assistant.' using errcode = '42501';
  end if;
  select university_id into v_university from public.campus_classrooms where id = p_classroom_id;
  if p_student_id is not null and not exists (
    select 1 from public.campus_classroom_enrollments e
    join public.profiles p on p.id = e.student_id
    join public.campus_memberships m on m.user_id = p.id and m.university_id = v_university
    where e.classroom_id = p_classroom_id and e.student_id = p_student_id
      and p.role = 'student' and p.verification_status = 'verified'
      and m.membership_status = 'active'
  ) then
    raise exception 'The assistant must be a verified, active-campus student enrolled in this class.' using errcode = '22023';
  end if;
  update public.campus_classrooms set assistant_student_id = p_student_id, updated_at = now()
  where id = p_classroom_id;
end;
$$;
revoke all on function public.set_campus_class_assistant(uuid,uuid) from public, anon;
grant execute on function public.set_campus_class_assistant(uuid,uuid) to authenticated;
