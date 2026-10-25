-- Consolidate course and attendance SELECT policies to avoid permissive policy OR overlaps.
begin;
drop policy if exists campus_class_attendance_select_members on public.campus_class_attendance;
drop policy if exists campus_class_attendance_select_authorized on public.campus_class_attendance;
create policy campus_class_attendance_select_authorized on public.campus_class_attendance
for select to authenticated using (
  exists (
    select 1 from public.campus_class_sessions s
    where s.id = campus_class_attendance.session_id
      and (
        private.is_verified_classroom_teacher(s.classroom_id)
        or (
          campus_class_attendance.student_id = (select auth.uid())
          and private.can_access_classroom(s.classroom_id)
          and (select private.current_user_has_verified_campus_access())
        )
      )
  )
);
drop policy if exists campus_courses_read_own_pending on public.campus_courses;
drop policy if exists campus_courses_read_campus_published_or_staff on public.campus_courses;
create policy campus_courses_read_same_campus on public.campus_courses
for select to authenticated using (
  university_id = (select private.current_campus_university_id())
  and (
    status = 'published'
    or created_by = (select auth.uid())
    or (status = 'pending' and (select private.current_campus_role()) = any (array['admin','security','teacher']))
  )
);
commit;
