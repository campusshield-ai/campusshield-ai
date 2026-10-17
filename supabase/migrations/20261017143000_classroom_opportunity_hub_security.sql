-- CampusShield AI: harden existing classroom access and add the private Opportunity Hub.
-- Repository-only migration until staging review/acceptance tests are explicitly run.
begin;

-- Existing staging already has these classroom tables. Keep their schema; tighten the authorization helpers
-- and remove broad direct grants (RLS does not protect against TRUNCATE).
create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
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

create or replace function private.is_verified_classroom_teacher(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.campus_classrooms c
    join public.profiles p on p.id = (select auth.uid())
    join public.campus_memberships m
      on m.user_id = p.id
     and m.university_id = c.university_id
    where c.id = p_classroom_id
      and c.teacher_id = p.id
      and p.role = 'teacher'
      and p.verification_status = 'verified'
      and m.campus_role = 'teacher'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  );
$function$;

revoke all on function private.can_access_classroom(uuid) from public, anon;
revoke all on function private.is_verified_classroom_teacher(uuid) from public, anon;
grant execute on function private.can_access_classroom(uuid) to authenticated;
grant execute on function private.is_verified_classroom_teacher(uuid) to authenticated;

-- Ensure joining requires a verified student AND verified active membership in the same campus.
create or replace function public.join_campus_classroom(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_class public.campus_classrooms;
begin
  if v_user is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.campus_memberships m on m.user_id = p.id
    where p.id = v_user
      and p.role = 'student'
      and p.verification_status = 'verified'
      and m.campus_role = 'student'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  ) then
    raise exception 'Only verified students with an active verified campus membership can join a class.'
      using errcode = '42501';
  end if;

  select c.* into v_class
  from public.campus_classrooms c
  join public.campus_memberships m
    on m.user_id = v_user
   and m.university_id = c.university_id
   and m.campus_role = 'student'
   and m.membership_status = 'active'
   and m.verification_status = 'verified'
  where upper(c.join_code) = upper(btrim(coalesce(p_join_code, '')))
  limit 1;

  if v_class.id is null then
    raise exception 'Class code not found for your verified campus.'
      using errcode = 'P0002';
  end if;

  insert into public.campus_classroom_enrollments(classroom_id, student_id)
  values (v_class.id, v_user)
  on conflict (classroom_id, student_id) do nothing;

  return v_class.id;
end;
$function$;

-- Keep classroom writes behind explicit, owner-checked RPCs.
create or replace function public.create_campus_classroom_announcement(
  p_classroom_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;
  if not private.is_verified_classroom_teacher(p_classroom_id) then
    raise exception 'Only the verified teacher who owns this class can publish announcements.'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120
     or char_length(btrim(coalesce(p_body, ''))) not between 5 and 4000 then
    raise exception 'Check the announcement title and body lengths.' using errcode = '22023';
  end if;

  insert into public.campus_classroom_announcements(classroom_id, author_id, title, body)
  values (p_classroom_id, v_user, btrim(p_title), btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.create_campus_classroom_material(
  p_classroom_id uuid,
  p_title text,
  p_description text,
  p_resource_url text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_url text := btrim(coalesce(p_resource_url, ''));
begin
  if v_user is null then
    raise exception 'Sign in is required.' using errcode = '28000';
  end if;
  if not private.is_verified_classroom_teacher(p_classroom_id) then
    raise exception 'Only the verified teacher who owns this class can add materials.'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 160
     or char_length(coalesce(p_description, '')) > 1000
     or char_length(v_url) > 2048
     or v_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Enter a valid title, description, and HTTP(S) resource link.'
      using errcode = '22023';
  end if;

  insert into public.campus_classroom_materials(classroom_id, uploaded_by, title, description, resource_url)
  values (p_classroom_id, v_user, btrim(p_title), btrim(coalesce(p_description, '')), v_url)
  returning id into v_id;
  return v_id;
end;
$function$;

-- New opportunity hub: listings are campus-scoped and all writes/moderation go through guarded RPCs.
create table if not exists public.campus_opportunities (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  category text not null check (category in (
    'scholarship','internship','grant','competition','hackathon','mentorship',
    'gift','free_item','student_support','other'
  )),
  description text not null check (char_length(btrim(description)) between 10 and 5000),
  eligibility text not null default '' check (char_length(eligibility) <= 2000),
  provider_name text not null check (char_length(btrim(provider_name)) between 2 and 160),
  source_url text not null check (
    char_length(source_url) <= 2048 and source_url ~* '^https?://[^[:space:]]+$'
  ),
  contact_url text check (
    contact_url is null or (char_length(contact_url) <= 2048 and contact_url ~* '^https?://[^[:space:]]+$')
  ),
  deadline timestamptz,
  status text not null default 'draft'
    check (status in ('draft','pending','published','rejected','expired','archived')),
  is_official boolean not null default false,
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_opportunities_campus_status_deadline_idx
  on public.campus_opportunities (university_id, status, deadline);
create index if not exists campus_opportunities_owner_created_idx
  on public.campus_opportunities (created_by, created_at desc);

alter table public.campus_opportunities enable row level security;

drop policy if exists campus_opportunities_read_same_campus on public.campus_opportunities;
create policy campus_opportunities_read_same_campus
  on public.campus_opportunities for select to authenticated
  using (
    university_id = (select private.current_campus_university_id())
    and (
      (status = 'published' and (deadline is null or deadline > now()))
      or created_by = (select auth.uid())
      or private.current_campus_role() = any (array['admin','security','teacher'])
    )
  );

-- Remove default API grants: RLS does not protect against TRUNCATE, and writes must use guarded RPCs.
revoke all on table public.campus_opportunities from public, anon, authenticated;
grant select (
  id, university_id, title, category, description, eligibility, provider_name,
  source_url, contact_url, deadline, status, is_official, created_at, updated_at
) on table public.campus_opportunities to authenticated;

-- Classroom table grants are explicitly least-privilege. Do not expose join codes or internal user IDs.
revoke all on table public.campus_classrooms from public, anon, authenticated;
revoke all on table public.campus_classroom_enrollments from public, anon, authenticated;
revoke all on table public.campus_classroom_announcements from public, anon, authenticated;
revoke all on table public.campus_classroom_materials from public, anon, authenticated;

grant select (id, university_id, name, subject, description, created_at, updated_at)
  on table public.campus_classrooms to authenticated;
grant select (id, classroom_id, created_at)
  on table public.campus_classroom_enrollments to authenticated;
grant select (id, classroom_id, title, body, created_at)
  on table public.campus_classroom_announcements to authenticated;
grant select (id, classroom_id, title, description, resource_url, created_at)
  on table public.campus_classroom_materials to authenticated;

-- A class roster contains student names and internal IDs; only the verified class-owning teacher may read it.
create or replace function public.list_campus_classroom_roster(p_classroom_id uuid)
returns table(student_id uuid, display_name text, is_assistant boolean)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_verified_classroom_teacher(p_classroom_id) then
    raise exception 'Only the verified teacher who owns this class can view its roster.'
      using errcode = '42501';
  end if;
  return query
    select p.id,
      coalesce(nullif(btrim(p.display_name), ''), 'Student'),
      (c.assistant_student_id = p.id)
    from public.campus_classroom_enrollments e
    join public.profiles p on p.id = e.student_id
    join public.campus_classrooms c on c.id = e.classroom_id
    where e.classroom_id = p_classroom_id
    order by coalesce(nullif(btrim(p.display_name), ''), 'Student');
end;
$function$;

-- Keep existing classroom entry points authenticated-only as well.
revoke all on function public.create_campus_classroom(text,text,text) from public, anon;
revoke all on function public.get_campus_classroom_join_code(uuid) from public, anon;
revoke all on function public.list_campus_classroom_roster(uuid) from public, anon;
grant execute on function public.create_campus_classroom(text,text,text) to authenticated;
grant execute on function public.get_campus_classroom_join_code(uuid) to authenticated;
grant execute on function public.list_campus_classroom_roster(uuid) to authenticated;

-- Guarded opportunity RPCs. User/campus IDs are derived from auth and verified membership, never client-supplied.
create or replace function public.create_campus_opportunity(
  p_title text,
  p_category text,
  p_description text,
  p_eligibility text,
  p_provider_name text,
  p_source_url text,
  p_contact_url text default null,
  p_deadline timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_id uuid;
begin
  if v_user is null or v_university is null or (select private.current_campus_role()) is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or p_category not in ('scholarship','internship','grant','competition','hackathon','mentorship','gift','free_item','student_support','other')
     or char_length(btrim(coalesce(p_description, ''))) not between 10 and 5000
     or char_length(coalesce(p_eligibility, '')) > 2000
     or char_length(btrim(coalesce(p_provider_name, ''))) not between 2 and 160
     or char_length(btrim(coalesce(p_source_url, ''))) > 2048
     or btrim(coalesce(p_source_url, '')) !~* '^https?://[^[:space:]]+$'
     or (p_contact_url is not null and (char_length(btrim(p_contact_url)) > 2048 or btrim(p_contact_url) !~* '^https?://[^[:space:]]+$')) then
    raise exception 'Check the opportunity details and use valid HTTP(S) links.' using errcode = '22023';
  end if;
  insert into public.campus_opportunities (
    university_id, created_by, title, category, description, eligibility,
    provider_name, source_url, contact_url, deadline, status
  ) values (
    v_university, v_user, btrim(p_title), p_category, btrim(p_description),
    coalesce(p_eligibility, ''), btrim(p_provider_name), btrim(p_source_url),
    nullif(btrim(coalesce(p_contact_url, '')), ''), p_deadline, 'draft'
  ) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.update_my_campus_opportunity(
  p_opportunity_id uuid,
  p_title text,
  p_category text,
  p_description text,
  p_eligibility text,
  p_provider_name text,
  p_source_url text,
  p_contact_url text,
  p_deadline timestamptz
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or (select private.current_campus_university_id()) is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or p_category not in ('scholarship','internship','grant','competition','hackathon','mentorship','gift','free_item','student_support','other')
     or char_length(btrim(coalesce(p_description, ''))) not between 10 and 5000
     or char_length(coalesce(p_eligibility, '')) > 2000
     or char_length(btrim(coalesce(p_provider_name, ''))) not between 2 and 160
     or char_length(btrim(coalesce(p_source_url, ''))) > 2048
     or btrim(coalesce(p_source_url, '')) !~* '^https?://[^[:space:]]+$'
     or (p_contact_url is not null and (char_length(btrim(p_contact_url)) > 2048 or btrim(p_contact_url) !~* '^https?://[^[:space:]]+$')) then
    raise exception 'Check the opportunity details and use valid HTTP(S) links.' using errcode = '22023';
  end if;
  update public.campus_opportunities
  set title=btrim(p_title), category=p_category, description=btrim(p_description),
      eligibility=coalesce(p_eligibility, ''), provider_name=btrim(p_provider_name),
      source_url=btrim(p_source_url), contact_url=nullif(btrim(coalesce(p_contact_url, '')), ''),
      deadline=p_deadline, updated_at=now()
  where id=p_opportunity_id
    and university_id=(select private.current_campus_university_id())
    and created_by=v_user
    and status in ('draft','rejected');
  if not found then
    raise exception 'Only your own draft or rejected opportunity can be edited.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.submit_campus_opportunity(p_opportunity_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.campus_opportunities
  set status='pending', review_notes=null, reviewed_by=null, reviewed_at=null, updated_at=now()
  where id=p_opportunity_id
    and created_by=(select auth.uid())
    and university_id=(select private.current_campus_university_id())
    and status in ('draft','rejected')
    and (deadline is null or deadline > now());
  if not found then
    raise exception 'Only your own non-expired draft or rejected opportunity can be submitted.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.list_my_campus_opportunities()
returns table (
  id uuid, title text, category text, description text, eligibility text,
  provider_name text, source_url text, contact_url text, deadline timestamptz,
  status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null or (select private.current_campus_university_id()) is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  return query
    select o.id, o.title, o.category, o.description, o.eligibility,
      o.provider_name, o.source_url, o.contact_url, o.deadline, o.status,
      o.is_official, o.created_at, o.updated_at
    from public.campus_opportunities o
    where o.created_by=(select auth.uid())
      and o.university_id=(select private.current_campus_university_id())
    order by o.created_at desc
    limit 100;
end;
$function$;

create or replace function public.review_campus_opportunity(
  p_opportunity_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_role text := (select private.current_campus_role());
begin
  if v_user is null or coalesce(v_role, '') not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('publish','reject') then
    raise exception 'Decision must be publish or reject.' using errcode = '22023';
  end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_review_notes, ''))) < 3 then
    raise exception 'Provide a brief reason when rejecting an opportunity.' using errcode = '22023';
  end if;
  update public.campus_opportunities
  set status=case p_decision when 'publish' then 'published' else 'rejected' end,
      is_official=false,
      review_notes=case when p_decision='reject' then left(btrim(p_review_notes),1000) else null end,
      reviewed_by=v_user, reviewed_at=now(), updated_at=now()
  where id=p_opportunity_id
    and university_id=(select private.current_campus_university_id())
    and status='pending';
  if not found then
    raise exception 'This opportunity is not awaiting review in your university.' using errcode = '42501';
  end if;
end;
$function$;

-- Grant only these explicit RPCs to signed-in users. SECURITY DEFINER functions enforce authorization internally.
revoke all on function public.join_campus_classroom(text) from public, anon;
revoke all on function public.create_campus_classroom_announcement(uuid,text,text) from public, anon, authenticated;
revoke all on function public.create_campus_classroom_material(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.submit_campus_opportunity(uuid) from public, anon, authenticated;
revoke all on function public.list_my_campus_opportunities() from public, anon, authenticated;
revoke all on function public.review_campus_opportunity(uuid,text,text) from public, anon, authenticated;

grant execute on function public.join_campus_classroom(text) to authenticated;
grant execute on function public.create_campus_classroom_announcement(uuid,text,text) to authenticated;
grant execute on function public.create_campus_classroom_material(uuid,text,text,text) to authenticated;
grant execute on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.submit_campus_opportunity(uuid) to authenticated;
grant execute on function public.list_my_campus_opportunities() to authenticated;
grant execute on function public.review_campus_opportunity(uuid,text,text) to authenticated;

commit;
