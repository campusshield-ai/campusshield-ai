-- CampusShield AI: student timetable enhancements and course-linked communities.
-- Additive migration. Existing planner rows and general campus groups are preserved.

begin;

-- Staging has an older campus-life schema, so ensure the course directory tables exist.
-- In production these tables already exist; IF NOT EXISTS preserves their data.
create table if not exists public.campus_courses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  course_code text not null check (char_length(btrim(course_code)) between 2 and 32),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  faculty text check (faculty is null or char_length(btrim(faculty)) <= 120),
  department text check (department is null or char_length(btrim(department)) <= 120),
  level text not null default 'all' check (level in ('all','100','200','300','400','500','600','postgraduate')),
  summary text not null default '' check (char_length(summary) <= 2000),
  status text not null default 'pending' check (status in ('pending','published','rejected','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id,course_code)
);

create index if not exists campus_courses_campus_status_idx
  on public.campus_courses(university_id,status,course_code);

create table if not exists public.campus_course_resources (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  course_id uuid references public.campus_courses(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  resource_type text not null check (resource_type in ('lecture_notes','past_question','reading','video','website','slides','other')),
  source_url text not null check (char_length(source_url) <= 2048 and source_url ~* '^https?://[^[:space:]]+  add column if not exists ends_at timestamptz,
  add column if not exists location text not null default '',
  add column if not exists weekdays smallint[] not null default array[]::smallint[],
  add column if not exists repeat_until date,
  add column if not exists course_id uuid references public.campus_courses(id) on delete set null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_ends_after_start_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_ends_after_start_check
      check (ends_at is null or (starts_at is not null and ends_at > starts_at));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_weekdays_valid_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_weekdays_valid_check
      check (
        cardinality(weekdays) <= 7
        and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_weekly_class_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_weekly_class_check
      check (cardinality(weekdays)=0 or (kind='class' and starts_at is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_repeat_until_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_repeat_until_check
      check (repeat_until is null or (cardinality(weekdays)>0 and starts_at is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_location_length_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_location_length_check
      check (char_length(location) <= 180);
  end if;
end;
$constraints$;

create index if not exists shieldmind_planner_items_user_start_idx
  on public.shieldmind_planner_items(user_id, starts_at);
create index if not exists shieldmind_planner_items_course_idx
  on public.shieldmind_planner_items(course_id) where course_id is not null;

-- Enforce course association at the row-policy boundary too, not just in the UI/RPC.
drop policy if exists shieldmind_planner_insert_own on public.shieldmind_planner_items;
create policy shieldmind_planner_insert_own
  on public.shieldmind_planner_items for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=shieldmind_planner_items.course_id
          and c.university_id=(select private.current_campus_university_id())
          and c.status='published'
      )
    )
  );

drop policy if exists shieldmind_planner_update_own on public.shieldmind_planner_items;
create policy shieldmind_planner_update_own
  on public.shieldmind_planner_items for update to authenticated
  using (user_id=(select auth.uid()))
  with check (
    user_id=(select auth.uid())
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=shieldmind_planner_items.course_id
          and c.university_id=(select private.current_campus_university_id())
          and c.status='published'
      )
    )
  );

create or replace function public.list_my_timetable_items()
returns table (
  id uuid,
  title text,
  kind text,
  details text,
  starts_at timestamptz,
  ends_at timestamptz,
  remind_at timestamptz,
  completed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  location text,
  weekdays smallint[],
  repeat_until date,
  course_id uuid,
  course_code text,
  course_title text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.shieldmind_require_eligible_caller();

  return query
  select p.id,p.title,p.kind,p.details,p.starts_at,p.ends_at,p.remind_at,
         p.completed,p.created_at,p.updated_at,p.location,p.weekdays,p.repeat_until,
         p.course_id,c.course_code,c.title
  from public.shieldmind_planner_items p
  left join public.campus_courses c
    on c.id=p.course_id
   and c.university_id=(select private.current_campus_university_id())
   and c.status='published'
  where p.user_id=(select auth.uid())
  order by p.starts_at nulls last,p.created_at desc
  limit 250;
end;
$function$;

create or replace function public.create_my_timetable_item(
  p_title text,
  p_kind text,
  p_details text default '',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_remind_at timestamptz default null,
  p_location text default '',
  p_weekdays smallint[] default array[]::smallint[],
  p_repeat_until date default null,
  p_course_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_university_id uuid;
  v_course_status text;
  v_weekdays smallint[];
  v_location text := btrim(coalesce(p_location,''));
begin
  perform private.shieldmind_require_eligible_caller();

  if char_length(btrim(coalesce(p_title,''))) not between 2 and 120 then
    raise exception 'Title must be between 2 and 120 characters.';
  end if;
  if coalesce(p_kind,'revision') not in ('revision','class','assignment','exam','reminder') then
    raise exception 'Choose a valid timetable item type.';
  end if;
  if char_length(coalesce(p_details,'')) > 1000 then
    raise exception 'Notes must be 1,000 characters or fewer.';
  end if;
  if char_length(v_location)>180 then
    raise exception 'Location must be 180 characters or fewer.';
  end if;
  if p_ends_at is not null and (p_starts_at is null or p_ends_at<=p_starts_at) then
    raise exception 'The end time must be after the start time.';
  end if;

  select coalesce(array_agg(distinct d order by d),array[]::smallint[])
    into v_weekdays
  from unnest(coalesce(p_weekdays,array[]::smallint[])) as day_values(d);

  if exists(select 1 from unnest(v_weekdays) as day_values(d) where d<1 or d>7) then
    raise exception 'Choose valid weekdays.';
  end if;
  if cardinality(v_weekdays)>0 and (coalesce(p_kind,'revision')<>'class' or p_starts_at is null) then
    raise exception 'Only scheduled classes can repeat weekly. Choose a first date and time.';
  end if;
  if p_repeat_until is not null and cardinality(v_weekdays)=0 then
    raise exception 'Choose weekly repeat days before setting an end date.';
  end if;
  if p_repeat_until is not null and p_starts_at is not null
     and p_repeat_until < (p_starts_at at time zone 'UTC')::date then
    raise exception 'The repeat end date cannot be before the first class date.';
  end if;

  if p_course_id is not null then
    select c.university_id,c.status into v_course_university_id,v_course_status
    from public.campus_courses c where c.id=p_course_id;
    if not found or v_course_status<>'published' then
      raise exception 'Choose a published course from your university.';
    end if;
    if v_university_id is null or v_course_university_id<>v_university_id then
      raise exception 'You can only link timetable items to courses at your selected university.';
    end if;
  end if;

  insert into public.shieldmind_planner_items
    (user_id,title,kind,details,starts_at,ends_at,remind_at,location,weekdays,repeat_until,course_id)
  values
    (v_user_id,btrim(p_title),coalesce(p_kind,'revision'),coalesce(p_details,''),
     p_starts_at,p_ends_at,p_remind_at,v_location,v_weekdays,p_repeat_until,p_course_id)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.list_my_timetable_items() from public,anon,authenticated;
revoke all on function public.create_my_timetable_item(text,text,text,timestamptz,timestamptz,timestamptz,text,smallint[],date,uuid) from public,anon,authenticated;
grant execute on function public.list_my_timetable_items() to authenticated;
grant execute on function public.create_my_timetable_item(text,text,text,timestamptz,timestamptz,timestamptz,text,smallint[],date,uuid) to authenticated;

-- A published course can have one official course community. Existing general groups are unchanged.
alter table public.campus_groups
  add column if not exists course_id uuid references public.campus_courses(id) on delete set null;

create unique index if not exists campus_groups_one_course_community_idx
  on public.campus_groups(university_id,course_id)
  where course_id is not null;

drop policy if exists campus_groups_create_same_campus on public.campus_groups;
create policy campus_groups_create_same_campus
  on public.campus_groups for insert to authenticated
  with check (
    (select private.current_campus_account_status())=any(array['pending','verified']::text[])
    and created_by=(select auth.uid())
    and university_id=(select private.current_campus_university_id())
    and status='pending'
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=campus_groups.course_id
          and c.university_id=campus_groups.university_id
          and c.status='published'
      )
    )
  );

create or replace function public.create_campus_course_group(
  p_course_id uuid,
  p_description text default null
)
returns table(group_id uuid, group_status text, group_name text, already_exists boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_code text;
  v_course_title text;
  v_course_status text;
  v_group_id uuid;
  v_group_status text;
  v_group_name text;
  v_username text;
  v_description text;
begin
  if v_user_id is null then raise exception 'Sign in to create a course community.'; end if;
  if v_university_id is null
     or (select private.current_campus_account_status()) not in ('pending','verified') then
    raise exception 'Choose your university and complete campus verification first.';
  end if;

  select c.course_code,c.title,c.status
    into v_course_code,v_course_title,v_course_status
  from public.campus_courses c
  where c.id=p_course_id and c.university_id=v_university_id;

  if not found or v_course_status<>'published' then
    raise exception 'This published course is not available in your university.';
  end if;

  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id
  limit 1;

  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;

  select cp.username into v_username
  from public.community_profiles cp where cp.user_id=v_user_id;
  v_description := nullif(btrim(coalesce(p_description,'')), '');
  if v_description is null then
    v_description := 'Course community for '||v_course_code||' · '||v_course_title||'. Share study questions, revision sessions and useful approved resources.';
  end if;
  if char_length(v_description)>1000 then
    raise exception 'Course community description must be 1,000 characters or fewer.';
  end if;

  v_group_name := left(v_course_code||' · '||v_course_title,100);

  insert into public.campus_groups
    (university_id,course_id,created_by,name,description,group_type,privacy,status,creator_username)
  values
    (v_university_id,p_course_id,v_user_id,v_group_name,v_description,'course','campus','pending',v_username)
  returning id,status,name into v_group_id,v_group_status,v_group_name;

  -- The course-community creator is auto-enrolled as a moderator; discussion stays closed until approval.
  insert into public.campus_group_members(group_id,user_id,member_role)
  values (v_group_id,v_user_id,'moderator')
  on conflict (group_id,user_id) do nothing;

  return query select v_group_id,v_group_status,v_group_name,false;
exception when unique_violation then
  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id;
  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;
  raise;
end;
$function$;

revoke all on function public.create_campus_course_group(uuid,text) from public,anon,authenticated;
grant execute on function public.create_campus_course_group(uuid,text) to authenticated;


-- Member-only course discussion rooms.
create table if not exists public.campus_course_community_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.campus_groups(id) on delete cascade,
  course_id uuid not null references public.campus_courses(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_course_community_messages_group_created_idx
  on public.campus_course_community_messages(group_id,created_at desc);
create index if not exists campus_course_community_messages_author_created_idx
  on public.campus_course_community_messages(author_id,created_at desc);

create table if not exists public.campus_course_community_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.campus_course_community_messages(id) on delete cascade,
  group_id uuid not null references public.campus_groups(id) on delete cascade,
  course_id uuid not null references public.campus_courses(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','personal_information','threats','other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique(message_id,reporter_id)
);

create index if not exists campus_course_community_reports_campus_status_idx
  on public.campus_course_community_reports(university_id,status,created_at);

alter table public.campus_course_community_messages enable row level security;
alter table public.campus_course_community_reports enable row level security;

revoke all on table public.campus_course_community_messages from anon,authenticated;
revoke all on table public.campus_course_community_reports from anon,authenticated;
grant select (id,group_id,course_id,university_id,author_username,body,status,created_at,updated_at)
  on table public.campus_course_community_messages to authenticated;

drop policy if exists campus_course_community_messages_read_members on public.campus_course_community_messages;
create policy campus_course_community_messages_read_members
  on public.campus_course_community_messages for select to authenticated
  using (
    university_id=(select private.current_campus_university_id())
    and status='published'
    and (select private.current_user_has_verified_campus_access())
    and exists (
      select 1 from public.campus_groups g
      where g.id=campus_course_community_messages.group_id
        and g.course_id=campus_course_community_messages.course_id
        and g.university_id=campus_course_community_messages.university_id
        and g.status='active'
        and (
          exists (
            select 1 from public.campus_group_members gm
            where gm.group_id=g.id and gm.user_id=(select auth.uid())
          )
          or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
        )
    )
  );

drop policy if exists campus_course_community_reports_no_direct_client_access on public.campus_course_community_reports;
create policy campus_course_community_reports_no_direct_client_access
  on public.campus_course_community_reports for all to authenticated
  using (false) with check (false);

create or replace function public.list_campus_course_community_messages(p_group_id uuid)
returns table(id uuid,author_username text,body text,status text,created_at timestamptz,is_mine boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to read course discussions.';
  end if;

  if not exists (
    select 1 from public.campus_groups g
    where g.id=p_group_id and g.university_id=v_university_id and g.course_id is not null
      and g.status='active'
      and (
        exists (select 1 from public.campus_group_members gm where gm.group_id=g.id and gm.user_id=v_user_id)
        or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
      )
  ) then
    raise exception 'Join this approved course community before opening its discussion.';
  end if;

  return query
  select m.id,m.author_username,m.body,m.status,m.created_at,m.author_id=v_user_id
  from public.campus_course_community_messages m
  where m.group_id=p_group_id and m.university_id=v_university_id and m.status='published'
  order by m.created_at asc
  limit 200;
end;
$function$;

create or replace function public.send_campus_course_community_message(p_group_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_id uuid;
  v_username text;
  v_body text := btrim(coalesce(p_body,''));
  v_recent_count integer;
  v_message_id uuid;
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to post in course discussions.';
  end if;
  if char_length(v_body) not between 1 and 1200 then raise exception 'Messages must be between 1 and 1200 characters.'; end if;

  select g.course_id into v_course_id
  from public.campus_groups g
  where g.id=p_group_id and g.university_id=v_university_id and g.course_id is not null and g.status='active';

  if not found then raise exception 'This approved course community is not available in your university.'; end if;
  if not exists(select 1 from public.campus_group_members gm where gm.group_id=p_group_id and gm.user_id=v_user_id) then
    raise exception 'Join this course community before posting.';
  end if;

  select count(*)::integer into v_recent_count
  from public.campus_course_community_messages m
  where m.author_id=v_user_id and m.created_at>now()-interval '1 minute';
  if v_recent_count>=8 then raise exception 'You are sending messages too quickly. Wait a minute and try again.'; end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your campus username is not ready yet. Refresh and try again.'; end if;

  insert into public.campus_course_community_messages
    (group_id,course_id,university_id,author_id,author_username,body)
  values (p_group_id,v_course_id,v_university_id,v_user_id,v_username,v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

create or replace function public.report_campus_course_community_message(
  p_message_id uuid,p_reason text,p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_group_id uuid;
  v_course_id uuid;
  v_author_id uuid;
  v_report_id uuid;
  v_details text := nullif(btrim(coalesce(p_details,'')),'');
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to report course messages.';
  end if;
  if p_reason is null or p_reason not in ('spam','harassment','personal_information','threats','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if v_details is not null and char_length(v_details)>500 then raise exception 'Report details must be 500 characters or fewer.'; end if;

  select m.group_id,m.course_id,m.author_id into v_group_id,v_course_id,v_author_id
  from public.campus_course_community_messages m
  join public.campus_groups g on g.id=m.group_id
  where m.id=p_message_id and m.university_id=v_university_id and m.status='published'
    and g.status='active'
    and exists(select 1 from public.campus_group_members gm where gm.group_id=g.id and gm.user_id=v_user_id);

  if not found then raise exception 'This course message is no longer available to report.'; end if;
  if v_author_id=v_user_id then raise exception 'You cannot report your own message.'; end if;

  insert into public.campus_course_community_reports
    (message_id,group_id,course_id,university_id,reporter_id,reason,details)
  values (p_message_id,v_group_id,v_course_id,v_university_id,v_user_id,p_reason,v_details)
  returning id into v_report_id;
  return v_report_id;
exception when unique_violation then raise exception 'You have already reported this message.';
end;
$function$;

create or replace function public.list_campus_course_community_reports()
returns table(
  report_id uuid,group_id uuid,message_id uuid,message_body text,author_username text,
  reporter_username text,reason text,details text,created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if auth.uid() is null or not coalesce((select private.current_user_has_verified_campus_access()),false)
     or coalesce((select private.current_campus_role()),'') not in ('teacher','security','admin') then
    raise exception 'Only verified campus staff can review course discussion reports.';
  end if;
  return query
  select r.id,r.group_id,r.message_id,m.body,m.author_username,
         coalesce(cp.username,'campus_member'),r.reason,r.details,r.created_at
  from public.campus_course_community_reports r
  join public.campus_course_community_messages m on m.id=r.message_id
  left join public.community_profiles cp on cp.user_id=r.reporter_id
  where r.university_id=v_university_id and r.status='pending'
  order by r.created_at asc limit 100;
end;
$function$;

create or replace function public.resolve_campus_course_community_report(p_report_id uuid,p_action text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_message_id uuid;
begin
  if auth.uid() is null or not coalesce((select private.current_user_has_verified_campus_access()),false)
     or coalesce((select private.current_campus_role()),'') not in ('teacher','security','admin') then
    raise exception 'Only verified campus staff can review course discussion reports.';
  end if;
  if p_action is null or p_action not in ('hide','dismiss') then raise exception 'Choose hide or dismiss.'; end if;

  select r.message_id into v_message_id
  from public.campus_course_community_reports r
  where r.id=p_report_id and r.university_id=v_university_id and r.status='pending'
  for update;
  if not found then raise exception 'This pending course discussion report was not found.'; end if;

  if p_action='hide' then
    update public.campus_course_community_messages set status='hidden',updated_at=now()
    where id=v_message_id and university_id=v_university_id;
    update public.campus_course_community_reports set status='reviewed' where id=p_report_id;
  else
    update public.campus_course_community_reports set status='dismissed' where id=p_report_id;
  end if;
  return true;
end;
$function$;

revoke all on function public.list_campus_course_community_messages(uuid) from public,anon,authenticated;
revoke all on function public.send_campus_course_community_message(uuid,text) from public,anon,authenticated;
revoke all on function public.report_campus_course_community_message(uuid,text,text) from public,anon,authenticated;
revoke all on function public.list_campus_course_community_reports() from public,anon,authenticated;
revoke all on function public.resolve_campus_course_community_report(uuid,text) from public,anon,authenticated;
grant execute on function public.list_campus_course_community_messages(uuid) to authenticated;
grant execute on function public.send_campus_course_community_message(uuid,text) to authenticated;
grant execute on function public.report_campus_course_community_message(uuid,text,text) to authenticated;
grant execute on function public.list_campus_course_community_reports() to authenticated;
grant execute on function public.resolve_campus_course_community_report(uuid,text) to authenticated;

do $publication$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename='campus_course_community_messages') then
    execute 'alter publication supabase_realtime add table public.campus_course_community_messages';
  end if;
end;
$publication$;


commit;
),
  source_label text not null default 'External resource' check (char_length(btrim(source_label)) between 2 and 120),
  status text not null default 'pending' check (status in ('pending','published','rejected','archived')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_course_resources_campus_status_idx
  on public.campus_course_resources(university_id,status,created_at desc);

alter table public.campus_courses enable row level security;
alter table public.campus_course_resources enable row level security;
revoke all on table public.campus_courses, public.campus_course_resources from anon;
grant select,insert,update on table public.campus_courses, public.campus_course_resources to authenticated;

do $course_policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_courses' and policyname='campus_courses_read_campus_published_or_staff') then
    execute $policy$create policy campus_courses_read_campus_published_or_staff on public.campus_courses for select to authenticated
      using (university_id=(select private.current_campus_university_id()) and (status='published' or (status='pending' and (select private.current_campus_role())=any(array['admin','security','teacher']))))$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_courses' and policyname='campus_courses_read_own_pending') then
    execute $policy$create policy campus_courses_read_own_pending on public.campus_courses for select to authenticated
      using (created_by=(select auth.uid()) and university_id=(select private.current_campus_university_id()))$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_courses' and policyname='campus_courses_suggest_own') then
    execute $policy$create policy campus_courses_suggest_own on public.campus_courses for insert to authenticated
      with check (created_by=(select auth.uid()) and university_id=(select private.current_campus_university_id()) and status='pending')$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_courses' and policyname='campus_courses_review_staff') then
    execute $policy$create policy campus_courses_review_staff on public.campus_courses for update to authenticated
      using (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))
      with check (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_course_resources' and policyname='campus_course_resources_read_campus_published_or_staff') then
    execute $policy$create policy campus_course_resources_read_campus_published_or_staff on public.campus_course_resources for select to authenticated
      using (university_id=(select private.current_campus_university_id()) and (status='published' or submitted_by=(select auth.uid()) or (status='pending' and (select private.current_campus_role())=any(array['admin','security','teacher']))) )$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_course_resources' and policyname='campus_course_resources_submit_own') then
    execute $policy$create policy campus_course_resources_submit_own on public.campus_course_resources for insert to authenticated
      with check (submitted_by=(select auth.uid()) and university_id=(select private.current_campus_university_id()) and status='pending' and exists (
        select 1 from public.campus_courses c where c.id=course_id and c.university_id=campus_course_resources.university_id and c.status='published'
      ))$policy$;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='campus_course_resources' and policyname='campus_course_resources_review_staff') then
    execute $policy$create policy campus_course_resources_review_staff on public.campus_course_resources for update to authenticated
      using (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))
      with check (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))$policy$;
  end if;
end;
$course_policies$;

alter table public.shieldmind_planner_items
  add column if not exists ends_at timestamptz,
  add column if not exists location text not null default '',
  add column if not exists weekdays smallint[] not null default array[]::smallint[],
  add column if not exists repeat_until date,
  add column if not exists course_id uuid references public.campus_courses(id) on delete set null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_ends_after_start_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_ends_after_start_check
      check (ends_at is null or (starts_at is not null and ends_at > starts_at));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_weekdays_valid_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_weekdays_valid_check
      check (
        cardinality(weekdays) <= 7
        and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_weekly_class_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_weekly_class_check
      check (cardinality(weekdays)=0 or (kind='class' and starts_at is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_repeat_until_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_repeat_until_check
      check (repeat_until is null or (cardinality(weekdays)>0 and starts_at is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shieldmind_planner_items'::regclass
      and conname='shieldmind_planner_items_location_length_check'
  ) then
    alter table public.shieldmind_planner_items
      add constraint shieldmind_planner_items_location_length_check
      check (char_length(location) <= 180);
  end if;
end;
$constraints$;

create index if not exists shieldmind_planner_items_user_start_idx
  on public.shieldmind_planner_items(user_id, starts_at);
create index if not exists shieldmind_planner_items_course_idx
  on public.shieldmind_planner_items(course_id) where course_id is not null;

-- Enforce course association at the row-policy boundary too, not just in the UI/RPC.
drop policy if exists shieldmind_planner_insert_own on public.shieldmind_planner_items;
create policy shieldmind_planner_insert_own
  on public.shieldmind_planner_items for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=shieldmind_planner_items.course_id
          and c.university_id=(select private.current_campus_university_id())
          and c.status='published'
      )
    )
  );

drop policy if exists shieldmind_planner_update_own on public.shieldmind_planner_items;
create policy shieldmind_planner_update_own
  on public.shieldmind_planner_items for update to authenticated
  using (user_id=(select auth.uid()))
  with check (
    user_id=(select auth.uid())
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=shieldmind_planner_items.course_id
          and c.university_id=(select private.current_campus_university_id())
          and c.status='published'
      )
    )
  );

create or replace function public.list_my_timetable_items()
returns table (
  id uuid,
  title text,
  kind text,
  details text,
  starts_at timestamptz,
  ends_at timestamptz,
  remind_at timestamptz,
  completed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  location text,
  weekdays smallint[],
  repeat_until date,
  course_id uuid,
  course_code text,
  course_title text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.shieldmind_require_eligible_caller();

  return query
  select p.id,p.title,p.kind,p.details,p.starts_at,p.ends_at,p.remind_at,
         p.completed,p.created_at,p.updated_at,p.location,p.weekdays,p.repeat_until,
         p.course_id,c.course_code,c.title
  from public.shieldmind_planner_items p
  left join public.campus_courses c
    on c.id=p.course_id
   and c.university_id=(select private.current_campus_university_id())
   and c.status='published'
  where p.user_id=(select auth.uid())
  order by p.starts_at nulls last,p.created_at desc
  limit 250;
end;
$function$;

create or replace function public.create_my_timetable_item(
  p_title text,
  p_kind text,
  p_details text default '',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_remind_at timestamptz default null,
  p_location text default '',
  p_weekdays smallint[] default array[]::smallint[],
  p_repeat_until date default null,
  p_course_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_university_id uuid;
  v_course_status text;
  v_weekdays smallint[];
  v_location text := btrim(coalesce(p_location,''));
begin
  perform private.shieldmind_require_eligible_caller();

  if char_length(btrim(coalesce(p_title,''))) not between 2 and 120 then
    raise exception 'Title must be between 2 and 120 characters.';
  end if;
  if coalesce(p_kind,'revision') not in ('revision','class','assignment','exam','reminder') then
    raise exception 'Choose a valid timetable item type.';
  end if;
  if char_length(coalesce(p_details,'')) > 1000 then
    raise exception 'Notes must be 1,000 characters or fewer.';
  end if;
  if char_length(v_location)>180 then
    raise exception 'Location must be 180 characters or fewer.';
  end if;
  if p_ends_at is not null and (p_starts_at is null or p_ends_at<=p_starts_at) then
    raise exception 'The end time must be after the start time.';
  end if;

  select coalesce(array_agg(distinct d order by d),array[]::smallint[])
    into v_weekdays
  from unnest(coalesce(p_weekdays,array[]::smallint[])) as day_values(d);

  if exists(select 1 from unnest(v_weekdays) as day_values(d) where d<1 or d>7) then
    raise exception 'Choose valid weekdays.';
  end if;
  if cardinality(v_weekdays)>0 and (coalesce(p_kind,'revision')<>'class' or p_starts_at is null) then
    raise exception 'Only scheduled classes can repeat weekly. Choose a first date and time.';
  end if;
  if p_repeat_until is not null and cardinality(v_weekdays)=0 then
    raise exception 'Choose weekly repeat days before setting an end date.';
  end if;
  if p_repeat_until is not null and p_starts_at is not null
     and p_repeat_until < (p_starts_at at time zone 'UTC')::date then
    raise exception 'The repeat end date cannot be before the first class date.';
  end if;

  if p_course_id is not null then
    select c.university_id,c.status into v_course_university_id,v_course_status
    from public.campus_courses c where c.id=p_course_id;
    if not found or v_course_status<>'published' then
      raise exception 'Choose a published course from your university.';
    end if;
    if v_university_id is null or v_course_university_id<>v_university_id then
      raise exception 'You can only link timetable items to courses at your selected university.';
    end if;
  end if;

  insert into public.shieldmind_planner_items
    (user_id,title,kind,details,starts_at,ends_at,remind_at,location,weekdays,repeat_until,course_id)
  values
    (v_user_id,btrim(p_title),coalesce(p_kind,'revision'),coalesce(p_details,''),
     p_starts_at,p_ends_at,p_remind_at,v_location,v_weekdays,p_repeat_until,p_course_id)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.list_my_timetable_items() from public,anon,authenticated;
revoke all on function public.create_my_timetable_item(text,text,text,timestamptz,timestamptz,timestamptz,text,smallint[],date,uuid) from public,anon,authenticated;
grant execute on function public.list_my_timetable_items() to authenticated;
grant execute on function public.create_my_timetable_item(text,text,text,timestamptz,timestamptz,timestamptz,text,smallint[],date,uuid) to authenticated;

-- A published course can have one official course community. Existing general groups are unchanged.
alter table public.campus_groups
  add column if not exists course_id uuid references public.campus_courses(id) on delete set null;

create unique index if not exists campus_groups_one_course_community_idx
  on public.campus_groups(university_id,course_id)
  where course_id is not null;

drop policy if exists campus_groups_create_same_campus on public.campus_groups;
create policy campus_groups_create_same_campus
  on public.campus_groups for insert to authenticated
  with check (
    (select private.current_campus_account_status())=any(array['pending','verified']::text[])
    and created_by=(select auth.uid())
    and university_id=(select private.current_campus_university_id())
    and status='pending'
    and (
      course_id is null
      or exists (
        select 1 from public.campus_courses c
        where c.id=campus_groups.course_id
          and c.university_id=campus_groups.university_id
          and c.status='published'
      )
    )
  );

create or replace function public.create_campus_course_group(
  p_course_id uuid,
  p_description text default null
)
returns table(group_id uuid, group_status text, group_name text, already_exists boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_code text;
  v_course_title text;
  v_course_status text;
  v_group_id uuid;
  v_group_status text;
  v_group_name text;
  v_username text;
  v_description text;
begin
  if v_user_id is null then raise exception 'Sign in to create a course community.'; end if;
  if v_university_id is null
     or (select private.current_campus_account_status()) not in ('pending','verified') then
    raise exception 'Choose your university and complete campus verification first.';
  end if;

  select c.course_code,c.title,c.status
    into v_course_code,v_course_title,v_course_status
  from public.campus_courses c
  where c.id=p_course_id and c.university_id=v_university_id;

  if not found or v_course_status<>'published' then
    raise exception 'This published course is not available in your university.';
  end if;

  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id
  limit 1;

  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;

  select cp.username into v_username
  from public.community_profiles cp where cp.user_id=v_user_id;
  v_description := nullif(btrim(coalesce(p_description,'')), '');
  if v_description is null then
    v_description := 'Course community for '||v_course_code||' · '||v_course_title||'. Share study questions, revision sessions and useful approved resources.';
  end if;
  if char_length(v_description)>1000 then
    raise exception 'Course community description must be 1,000 characters or fewer.';
  end if;

  v_group_name := left(v_course_code||' · '||v_course_title,100);

  insert into public.campus_groups
    (university_id,course_id,created_by,name,description,group_type,privacy,status,creator_username)
  values
    (v_university_id,p_course_id,v_user_id,v_group_name,v_description,'course','campus','pending',v_username)
  returning id,status,name into v_group_id,v_group_status,v_group_name;

  -- The course-community creator is auto-enrolled as a moderator; discussion stays closed until approval.
  insert into public.campus_group_members(group_id,user_id,member_role)
  values (v_group_id,v_user_id,'moderator')
  on conflict (group_id,user_id) do nothing;

  return query select v_group_id,v_group_status,v_group_name,false;
exception when unique_violation then
  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id;
  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;
  raise;
end;
$function$;

revoke all on function public.create_campus_course_group(uuid,text) from public,anon,authenticated;
grant execute on function public.create_campus_course_group(uuid,text) to authenticated;


-- Member-only course discussion rooms.
create table if not exists public.campus_course_community_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.campus_groups(id) on delete cascade,
  course_id uuid not null references public.campus_courses(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_course_community_messages_group_created_idx
  on public.campus_course_community_messages(group_id,created_at desc);
create index if not exists campus_course_community_messages_author_created_idx
  on public.campus_course_community_messages(author_id,created_at desc);

create table if not exists public.campus_course_community_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.campus_course_community_messages(id) on delete cascade,
  group_id uuid not null references public.campus_groups(id) on delete cascade,
  course_id uuid not null references public.campus_courses(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','personal_information','threats','other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique(message_id,reporter_id)
);

create index if not exists campus_course_community_reports_campus_status_idx
  on public.campus_course_community_reports(university_id,status,created_at);

alter table public.campus_course_community_messages enable row level security;
alter table public.campus_course_community_reports enable row level security;

revoke all on table public.campus_course_community_messages from anon,authenticated;
revoke all on table public.campus_course_community_reports from anon,authenticated;
grant select (id,group_id,course_id,university_id,author_username,body,status,created_at,updated_at)
  on table public.campus_course_community_messages to authenticated;

drop policy if exists campus_course_community_messages_read_members on public.campus_course_community_messages;
create policy campus_course_community_messages_read_members
  on public.campus_course_community_messages for select to authenticated
  using (
    university_id=(select private.current_campus_university_id())
    and status='published'
    and (select private.current_user_has_verified_campus_access())
    and exists (
      select 1 from public.campus_groups g
      where g.id=campus_course_community_messages.group_id
        and g.course_id=campus_course_community_messages.course_id
        and g.university_id=campus_course_community_messages.university_id
        and g.status='active'
        and (
          exists (
            select 1 from public.campus_group_members gm
            where gm.group_id=g.id and gm.user_id=(select auth.uid())
          )
          or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
        )
    )
  );

drop policy if exists campus_course_community_reports_no_direct_client_access on public.campus_course_community_reports;
create policy campus_course_community_reports_no_direct_client_access
  on public.campus_course_community_reports for all to authenticated
  using (false) with check (false);

create or replace function public.list_campus_course_community_messages(p_group_id uuid)
returns table(id uuid,author_username text,body text,status text,created_at timestamptz,is_mine boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to read course discussions.';
  end if;

  if not exists (
    select 1 from public.campus_groups g
    where g.id=p_group_id and g.university_id=v_university_id and g.course_id is not null
      and g.status='active'
      and (
        exists (select 1 from public.campus_group_members gm where gm.group_id=g.id and gm.user_id=v_user_id)
        or coalesce((select private.current_campus_role()),'')=any(array['teacher','security','admin']::text[])
      )
  ) then
    raise exception 'Join this approved course community before opening its discussion.';
  end if;

  return query
  select m.id,m.author_username,m.body,m.status,m.created_at,m.author_id=v_user_id
  from public.campus_course_community_messages m
  where m.group_id=p_group_id and m.university_id=v_university_id and m.status='published'
  order by m.created_at asc
  limit 200;
end;
$function$;

create or replace function public.send_campus_course_community_message(p_group_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_id uuid;
  v_username text;
  v_body text := btrim(coalesce(p_body,''));
  v_recent_count integer;
  v_message_id uuid;
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to post in course discussions.';
  end if;
  if char_length(v_body) not between 1 and 1200 then raise exception 'Messages must be between 1 and 1200 characters.'; end if;

  select g.course_id into v_course_id
  from public.campus_groups g
  where g.id=p_group_id and g.university_id=v_university_id and g.course_id is not null and g.status='active';

  if not found then raise exception 'This approved course community is not available in your university.'; end if;
  if not exists(select 1 from public.campus_group_members gm where gm.group_id=p_group_id and gm.user_id=v_user_id) then
    raise exception 'Join this course community before posting.';
  end if;

  select count(*)::integer into v_recent_count
  from public.campus_course_community_messages m
  where m.author_id=v_user_id and m.created_at>now()-interval '1 minute';
  if v_recent_count>=8 then raise exception 'You are sending messages too quickly. Wait a minute and try again.'; end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your campus username is not ready yet. Refresh and try again.'; end if;

  insert into public.campus_course_community_messages
    (group_id,course_id,university_id,author_id,author_username,body)
  values (p_group_id,v_course_id,v_university_id,v_user_id,v_username,v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

create or replace function public.report_campus_course_community_message(
  p_message_id uuid,p_reason text,p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_group_id uuid;
  v_course_id uuid;
  v_author_id uuid;
  v_report_id uuid;
  v_details text := nullif(btrim(coalesce(p_details,'')),'');
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to report course messages.';
  end if;
  if p_reason is null or p_reason not in ('spam','harassment','personal_information','threats','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if v_details is not null and char_length(v_details)>500 then raise exception 'Report details must be 500 characters or fewer.'; end if;

  select m.group_id,m.course_id,m.author_id into v_group_id,v_course_id,v_author_id
  from public.campus_course_community_messages m
  join public.campus_groups g on g.id=m.group_id
  where m.id=p_message_id and m.university_id=v_university_id and m.status='published'
    and g.status='active'
    and exists(select 1 from public.campus_group_members gm where gm.group_id=g.id and gm.user_id=v_user_id);

  if not found then raise exception 'This course message is no longer available to report.'; end if;
  if v_author_id=v_user_id then raise exception 'You cannot report your own message.'; end if;

  insert into public.campus_course_community_reports
    (message_id,group_id,course_id,university_id,reporter_id,reason,details)
  values (p_message_id,v_group_id,v_course_id,v_university_id,v_user_id,p_reason,v_details)
  returning id into v_report_id;
  return v_report_id;
exception when unique_violation then raise exception 'You have already reported this message.';
end;
$function$;

create or replace function public.list_campus_course_community_reports()
returns table(
  report_id uuid,group_id uuid,message_id uuid,message_body text,author_username text,
  reporter_username text,reason text,details text,created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if auth.uid() is null or not coalesce((select private.current_user_has_verified_campus_access()),false)
     or coalesce((select private.current_campus_role()),'') not in ('teacher','security','admin') then
    raise exception 'Only verified campus staff can review course discussion reports.';
  end if;
  return query
  select r.id,r.group_id,r.message_id,m.body,m.author_username,
         coalesce(cp.username,'campus_member'),r.reason,r.details,r.created_at
  from public.campus_course_community_reports r
  join public.campus_course_community_messages m on m.id=r.message_id
  left join public.community_profiles cp on cp.user_id=r.reporter_id
  where r.university_id=v_university_id and r.status='pending'
  order by r.created_at asc limit 100;
end;
$function$;

create or replace function public.resolve_campus_course_community_report(p_report_id uuid,p_action text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_message_id uuid;
begin
  if auth.uid() is null or not coalesce((select private.current_user_has_verified_campus_access()),false)
     or coalesce((select private.current_campus_role()),'') not in ('teacher','security','admin') then
    raise exception 'Only verified campus staff can review course discussion reports.';
  end if;
  if p_action is null or p_action not in ('hide','dismiss') then raise exception 'Choose hide or dismiss.'; end if;

  select r.message_id into v_message_id
  from public.campus_course_community_reports r
  where r.id=p_report_id and r.university_id=v_university_id and r.status='pending'
  for update;
  if not found then raise exception 'This pending course discussion report was not found.'; end if;

  if p_action='hide' then
    update public.campus_course_community_messages set status='hidden',updated_at=now()
    where id=v_message_id and university_id=v_university_id;
    update public.campus_course_community_reports set status='reviewed' where id=p_report_id;
  else
    update public.campus_course_community_reports set status='dismissed' where id=p_report_id;
  end if;
  return true;
end;
$function$;

revoke all on function public.list_campus_course_community_messages(uuid) from public,anon,authenticated;
revoke all on function public.send_campus_course_community_message(uuid,text) from public,anon,authenticated;
revoke all on function public.report_campus_course_community_message(uuid,text,text) from public,anon,authenticated;
revoke all on function public.list_campus_course_community_reports() from public,anon,authenticated;
revoke all on function public.resolve_campus_course_community_report(uuid,text) from public,anon,authenticated;
grant execute on function public.list_campus_course_community_messages(uuid) to authenticated;
grant execute on function public.send_campus_course_community_message(uuid,text) to authenticated;
grant execute on function public.report_campus_course_community_message(uuid,text,text) to authenticated;
grant execute on function public.list_campus_course_community_reports() to authenticated;
grant execute on function public.resolve_campus_course_community_report(uuid,text) to authenticated;

do $publication$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename='campus_course_community_messages') then
    execute 'alter publication supabase_realtime add table public.campus_course_community_messages';
  end if;
end;
$publication$;


commit;
