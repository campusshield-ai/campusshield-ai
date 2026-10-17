
-- CampusShield AI classroom module: class creation, enrollment, assistant, attendance and audit.
create table public.campus_classrooms (
 id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.campus_universities(id) on delete restrict,
 teacher_id uuid not null references public.profiles(id) on delete restrict,
 name text not null check(char_length(btrim(name)) between 3 and 120),
 subject text not null check(char_length(btrim(subject)) between 2 and 120),
 description text not null default '' check(char_length(description)<=1000),
 join_code text not null unique,
 assistant_student_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.campus_classroom_enrollments (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(classroom_id,student_id)
);
create table public.campus_classroom_announcements (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 3 and 120),
 body text not null check(char_length(btrim(body)) between 3 and 4000),
 created_at timestamptz not null default now()
);
create table public.campus_classroom_materials (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 uploaded_by uuid not null references public.profiles(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 2 and 160),
 description text not null default '' check(char_length(description)<=1000),
 resource_url text not null check(resource_url ~* '^https?://[^[:space:]]+$' and char_length(resource_url)<=2048),
 created_at timestamptz not null default now()
);
create table public.campus_class_sessions (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 session_date date not null default current_date,
 title text not null check(char_length(btrim(title)) between 2 and 160),
 recorded_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
create table public.campus_class_attendance (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.campus_class_sessions(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 status text not null check(status in ('present','absent','late')),
 marked_by uuid not null references public.profiles(id) on delete restrict,
 marked_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(session_id,student_id)
);
create table public.campus_class_attendance_audit (
 id uuid primary key default gen_random_uuid(),
 attendance_id uuid not null references public.campus_class_attendance(id) on delete cascade,
 session_id uuid not null references public.campus_class_sessions(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 old_status text,
 new_status text not null check(new_status in ('present','absent','late')),
 changed_by uuid not null references public.profiles(id) on delete restrict,
 changed_at timestamptz not null default now()
);
create index campus_classrooms_university_idx on public.campus_classrooms(university_id);
create index campus_classrooms_teacher_idx on public.campus_classrooms(teacher_id);
create index campus_classroom_enrollments_student_idx on public.campus_classroom_enrollments(student_id);
create index campus_classroom_announcements_class_idx on public.campus_classroom_announcements(classroom_id,created_at desc);
create index campus_classroom_materials_class_idx on public.campus_classroom_materials(classroom_id,created_at desc);
create index campus_class_sessions_class_idx on public.campus_class_sessions(classroom_id,session_date desc);
create index campus_class_attendance_session_idx on public.campus_class_attendance(session_id);
alter table public.campus_classrooms enable row level security;
alter table public.campus_classroom_enrollments enable row level security;
alter table public.campus_classroom_announcements enable row level security;
alter table public.campus_classroom_materials enable row level security;
alter table public.campus_class_sessions enable row level security;
alter table public.campus_class_attendance enable row level security;
alter table public.campus_class_attendance_audit enable row level security;

create or replace function private.is_verified_classroom_teacher(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c
 join public.profiles p on p.id=(select auth.uid())
 join public.campus_memberships m on m.user_id=p.id and m.university_id=c.university_id
 where c.id=p_classroom_id and c.teacher_id=p.id and p.role='teacher' and p.verification_status='verified'
 and m.campus_role='teacher' and m.membership_status='active' and m.verification_status='verified'); $$;
create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c where c.id=p_classroom_id and
 (c.teacher_id=(select auth.uid()) or c.assistant_student_id=(select auth.uid()) or exists(
 select 1 from public.campus_classroom_enrollments e where e.classroom_id=c.id and e.student_id=(select auth.uid())))); $$;
create or replace function private.can_manage_class_attendance(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c where c.id=p_classroom_id and
 (private.is_verified_classroom_teacher(c.id) or (c.assistant_student_id=(select auth.uid()) and exists(
 select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student' and p.verification_status='verified')))); $$;
revoke all on function private.is_verified_classroom_teacher(uuid) from public,anon;
revoke all on function private.can_access_classroom(uuid) from public,anon;
revoke all on function private.can_manage_class_attendance(uuid) from public,anon;
grant execute on function private.is_verified_classroom_teacher(uuid),private.can_access_classroom(uuid),private.can_manage_class_attendance(uuid) to authenticated;

create policy campus_classrooms_select_members on public.campus_classrooms for select to authenticated using(private.can_access_classroom(id));
create policy campus_classroom_enrollments_select_members on public.campus_classroom_enrollments for select to authenticated using(private.can_access_classroom(classroom_id));
create policy campus_classroom_announcements_select_members on public.campus_classroom_announcements for select to authenticated using(private.can_access_classroom(classroom_id));
create policy campus_classroom_announcements_insert_teacher on public.campus_classroom_announcements for insert to authenticated with check(author_id=(select auth.uid()) and private.is_verified_classroom_teacher(classroom_id));
create policy campus_classroom_materials_select_members on public.campus_classroom_materials for select to authenticated using(private.can_access_classroom(classroom_id));
create policy campus_classroom_materials_insert_teacher on public.campus_classroom_materials for insert to authenticated with check(uploaded_by=(select auth.uid()) and private.is_verified_classroom_teacher(classroom_id));
create policy campus_class_sessions_select_members on public.campus_class_sessions for select to authenticated using(private.can_access_classroom(classroom_id));
create policy campus_class_attendance_select_members on public.campus_class_attendance for select to authenticated using(exists(select 1 from public.campus_class_sessions s where s.id=session_id and private.can_access_classroom(s.classroom_id)));
create policy campus_class_attendance_audit_select_teacher on public.campus_class_attendance_audit for select to authenticated using(exists(select 1 from public.campus_class_sessions s where s.id=session_id and private.is_verified_classroom_teacher(s.classroom_id)));
grant select on public.campus_classrooms,public.campus_classroom_enrollments,public.campus_classroom_announcements,public.campus_classroom_materials,public.campus_class_sessions,public.campus_class_attendance,public.campus_class_attendance_audit to authenticated;
grant insert on public.campus_classroom_announcements,public.campus_classroom_materials to authenticated;
revoke insert,update,delete on public.campus_classrooms,public.campus_classroom_enrollments,public.campus_class_sessions,public.campus_class_attendance,public.campus_class_attendance_audit from anon,authenticated;
revoke update,delete on public.campus_classroom_announcements,public.campus_classroom_materials from anon,authenticated;

create or replace function public.create_campus_classroom(p_name text,p_subject text,p_description text default '')
returns public.campus_classrooms language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_university uuid; v_code text; v_class public.campus_classrooms;
begin
 if v_user is null then raise exception 'Sign in is required.' using errcode='28000'; end if;
 if not exists(select 1 from public.profiles p join public.campus_memberships m on m.user_id=p.id where p.id=v_user
 and p.role='teacher' and p.verification_status='verified' and m.campus_role='teacher'
 and m.membership_status='active' and m.verification_status='verified') then
 raise exception 'Only verified teachers with an active verified campus membership can create classes.' using errcode='42501'; end if;
 select m.university_id into v_university from public.campus_memberships m where m.user_id=v_user and m.campus_role='teacher'
 and m.membership_status='active' and m.verification_status='verified' limit 1;
 if char_length(btrim(coalesce(p_name,''))) not between 3 and 120 or char_length(btrim(coalesce(p_subject,''))) not between 2 and 120 or char_length(coalesce(p_description,''))>1000 then
 raise exception 'Check class name, subject, and description lengths.' using errcode='22023'; end if;
 loop v_code:='CSAI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)); exit when not exists(select 1 from public.campus_classrooms where join_code=v_code); end loop;
 insert into public.campus_classrooms(university_id,teacher_id,name,subject,description,join_code) values(v_university,v_user,btrim(p_name),btrim(p_subject),btrim(coalesce(p_description,'')),v_code) returning * into v_class;
 return v_class;
end; $$;

create or replace function public.join_campus_classroom(p_join_code text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_user uuid:=(select auth.uid()); v_class public.campus_classrooms;
begin
 if v_user is null then raise exception 'Sign in is required.' using errcode='28000'; end if;
 if not exists(select 1 from public.profiles p join public.campus_memberships m on m.user_id=p.id where p.id=v_user and p.role='student' and p.verification_status='verified' and m.membership_status='active') then
 raise exception 'Only verified students with an active campus membership can join a class.' using errcode='42501'; end if;
 select c.* into v_class from public.campus_classrooms c join public.campus_memberships m on m.user_id=v_user and m.university_id=c.university_id
 where upper(c.join_code)=upper(btrim(coalesce(p_join_code,''))) and m.membership_status='active' limit 1;
 if v_class.id is null then raise exception 'Class code not found for your active campus.' using errcode='P0002'; end if;
 insert into public.campus_classroom_enrollments(classroom_id,student_id) values(v_class.id,v_user) on conflict(classroom_id,student_id) do nothing;
 return v_class.id;
end; $$;
create or replace function public.set_campus_class_assistant(p_classroom_id uuid,p_student_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if not private.is_verified_classroom_teacher(p_classroom_id) then raise exception 'Only the verified class teacher can appoint or remove an assistant.' using errcode='42501'; end if;
 if p_student_id is not null and not exists(select 1 from public.campus_classroom_enrollments e join public.profiles p on p.id=e.student_id where e.classroom_id=p_classroom_id and e.student_id=p_student_id and p.role='student' and p.verification_status='verified') then
 raise exception 'The assistant must be a verified student enrolled in this class.' using errcode='22023'; end if;
 update public.campus_classrooms set assistant_student_id=p_student_id,updated_at=now() where id=p_classroom_id;
end; $$;
create or replace function public.list_campus_classroom_roster(p_classroom_id uuid)
returns table(student_id uuid,display_name text,is_assistant boolean) language plpgsql security definer set search_path=''
as $$ begin
 if not private.can_access_classroom(p_classroom_id) then raise exception 'You are not a member of this class.' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(btrim(p.display_name),''),'Student'),(c.assistant_student_id=p.id)
 from public.campus_classroom_enrollments e join public.profiles p on p.id=e.student_id join public.campus_classrooms c on c.id=e.classroom_id
 where e.classroom_id=p_classroom_id order by coalesce(nullif(btrim(p.display_name),''),'Student');
end; $$;
create or replace function public.create_campus_class_session(p_classroom_id uuid,p_title text,p_session_date date default current_date)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_session uuid; begin
 if not private.can_manage_class_attendance(p_classroom_id) then raise exception 'Only the teacher or appointed class assistant can create attendance sessions.' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 2 and 160 then raise exception 'Session title must be 2–160 characters.' using errcode='22023'; end if;
 insert into public.campus_class_sessions(classroom_id,session_date,title,recorded_by) values(p_classroom_id,coalesce(p_session_date,current_date),btrim(p_title),(select auth.uid())) returning id into v_session;
 return v_session;
end; $$;
create or replace function public.mark_campus_class_attendance(p_session_id uuid,p_student_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare v_classroom uuid; v_attendance uuid; begin
 if p_status not in ('present','absent','late') then raise exception 'Attendance status must be present, absent, or late.' using errcode='22023'; end if;
 select s.classroom_id into v_classroom from public.campus_class_sessions s where s.id=p_session_id;
 if v_classroom is null or not private.can_manage_class_attendance(v_classroom) then raise exception 'Only the teacher or appointed class assistant can mark attendance.' using errcode='42501'; end if;
 if not exists(select 1 from public.campus_classroom_enrollments e where e.classroom_id=v_classroom and e.student_id=p_student_id) then raise exception 'Attendance can only be recorded for enrolled students.' using errcode='22023'; end if;
 insert into public.campus_class_attendance(session_id,student_id,status,marked_by,marked_at,updated_at) values(p_session_id,p_student_id,p_status,(select auth.uid()),now(),now())
 on conflict(session_id,student_id) do update set status=excluded.status,marked_by=excluded.marked_by,marked_at=now(),updated_at=now() returning id into v_attendance;
 return v_attendance;
end; $$;
create or replace function public.audit_campus_class_attendance()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.campus_class_attendance_audit(attendance_id,session_id,student_id,old_status,new_status,changed_by)
 values(new.id,new.session_id,new.student_id,case when tg_op='UPDATE' then old.status else null end,new.status,new.marked_by);
 return new;
end; $$;
drop trigger if exists campus_class_attendance_audit_trigger on public.campus_class_attendance;
create trigger campus_class_attendance_audit_trigger after insert or update on public.campus_class_attendance for each row execute function public.audit_campus_class_attendance();
revoke all on function public.audit_campus_class_attendance() from public,anon,authenticated;
grant execute on function public.audit_campus_class_attendance() to postgres;
revoke all on function public.create_campus_classroom(text,text,text),public.join_campus_classroom(text),public.set_campus_class_assistant(uuid,uuid),public.list_campus_classroom_roster(uuid),public.create_campus_class_session(uuid,text,date),public.mark_campus_class_attendance(uuid,uuid,text) from public,anon;
grant execute on function public.create_campus_classroom(text,text,text),public.join_campus_classroom(text),public.set_campus_class_assistant(uuid,uuid),public.list_campus_classroom_roster(uuid),public.create_campus_class_session(uuid,text,date),public.mark_campus_class_attendance(uuid,uuid,text) to authenticated;
