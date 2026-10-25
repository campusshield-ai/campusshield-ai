-- CampusShield AI: student timetable enhancements and course-linked communities.
-- Additive migration. Existing planner rows and general campus groups are preserved.

begin;

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

commit;
