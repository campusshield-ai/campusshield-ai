-- Production-safe additive Campus Life parity migration.
-- Adds missing campus feature tables and RPCs without resetting data or modifying billing/identity verification tables.
-- All public RPCs delegate to private implementations; public execution is limited to authenticated callers.
begin;

create table if not exists public.campus_university_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  university_name text not null check (char_length(btrim(university_name)) between 3 and 180),
  state text not null check (char_length(btrim(state)) between 2 and 80),
  ownership text not null check (ownership in ('Federal', 'State', 'Private')),
  official_website text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.campus_groups (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 100),
  description text check (description is null or char_length(btrim(description)) <= 1000),
  group_type text not null check (group_type in ('faculty','department','course','society','interest','study_group')),
  privacy text not null default 'campus' check (privacy in ('campus','request_to_join')),
  status text not null default 'active' check (status in ('active','hidden','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.campus_group_members (
  group_id uuid not null references public.campus_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('member','moderator')),
  created_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create table if not exists public.campus_events (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(btrim(description)) <= 2000),
  category text not null check (category in ('academic','sports','society','career','faith','social','safety','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text check (location is null or char_length(btrim(location)) <= 180),
  status text not null default 'pending' check (status in ('pending','published','cancelled','hidden')),
  created_at timestamptz not null default now(),
  constraint campus_events_end_after_start check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.campus_event_rsvps (
  event_id uuid not null references public.campus_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'going' check (response in ('going','interested','not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id,user_id)
);

create table if not exists public.campus_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('books','electronics','accommodation','services','clothing','furniture','other')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 1800),
  price_ngn numeric(12,2) check (price_ngn is null or price_ngn >= 0),
  contact_instructions text check (contact_instructions is null or char_length(btrim(contact_instructions)) <= 250),
  status text not null default 'pending' check (status in ('pending','published','sold','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like' check (reaction_type in ('like','support','celebrate','helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.community_post_bookmarks (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

create table if not exists public.campus_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,followed_id),
  constraint campus_follows_not_self check (follower_id <> followed_id)
);

create table if not exists public.community_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  option_text text not null check (char_length(btrim(option_text)) between 1 and 160),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(post_id,position),
  unique(post_id,option_text)
);

create table if not exists public.community_poll_votes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  option_id uuid not null references public.community_poll_options(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists public.community_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  media_kind text not null check (media_kind in ('image','video')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  alt_text text check (alt_text is null or char_length(btrim(alt_text)) <= 250),
  created_at timestamptz not null default now()
);

create table if not exists public.campus_marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.campus_marketplace_listings(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('scam_suspicion','spam','unsafe_item','misleading_listing','harassment','other')),
  details text check (details is null or char_length(btrim(details)) <= 600),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint campus_marketplace_report_once unique (reporter_id,listing_id)
);

create table if not exists public.campus_helpdesk_tickets (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'CSH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_username text not null default 'campus member',
  category text not null check (category in (
    'facilities','hostel','wifi_it','classroom_equipment',
    'academic_service','administration','accessibility','other'
  )),
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  location text check (location is null or char_length(btrim(location)) <= 180),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'submitted' check (status in (
    'submitted','assigned','in_progress','waiting_student','resolved','closed'
  )),
  assigned_department text check (assigned_department is null or char_length(btrim(assigned_department)) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.campus_helpdesk_ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.campus_helpdesk_tickets(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_label text not null default 'Campus member',
  message text not null check (char_length(btrim(message)) between 2 and 1200),
  from_status text,
  to_status text,
  department_to text,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_notices (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  publisher_label text not null check (char_length(btrim(publisher_label)) between 2 and 100),
  title text not null check (char_length(btrim(title)) between 4 and 140),
  body text not null check (char_length(btrim(body)) between 10 and 5000),
  category text not null check (category in (
    'announcement','academic','registration','fees','facilities',
    'closure','events','safety','it_service','other'
  )),
  audience_scope text not null default 'campus'
    check (audience_scope in ('campus','faculty','department')),
  target_faculty text,
  target_department text,
  status text not null default 'published' check (status in ('published','archived')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (expires_at is null or expires_at > published_at),
  check (
    (audience_scope = 'campus' and target_faculty is null and target_department is null)
    or (audience_scope = 'faculty' and nullif(btrim(target_faculty), '') is not null and target_department is null)
    or (audience_scope = 'department' and nullif(btrim(target_faculty), '') is not null and nullif(btrim(target_department), '') is not null)
  )
);

create table if not exists public.campus_classrooms (
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

create table if not exists public.campus_classroom_enrollments (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(classroom_id,student_id)
);

create table if not exists public.campus_classroom_announcements (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 3 and 120),
 body text not null check(char_length(btrim(body)) between 3 and 4000),
 created_at timestamptz not null default now()
);

create table if not exists public.campus_classroom_materials (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 uploaded_by uuid not null references public.profiles(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 2 and 160),
 description text not null default '' check(char_length(description)<=1000),
 resource_url text not null check(resource_url ~* '^https?://[^[:space:]]+$' and char_length(resource_url)<=2048),
 created_at timestamptz not null default now()
);

create table if not exists public.campus_class_sessions (
 id uuid primary key default gen_random_uuid(),
 classroom_id uuid not null references public.campus_classrooms(id) on delete cascade,
 session_date date not null default current_date,
 title text not null check(char_length(btrim(title)) between 2 and 160),
 recorded_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);

create table if not exists public.campus_class_attendance (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.campus_class_sessions(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 status text not null check(status in ('present','absent','late')),
 marked_by uuid not null references public.profiles(id) on delete restrict,
 marked_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(session_id,student_id)
);

create table if not exists public.campus_class_attendance_audit (
 id uuid primary key default gen_random_uuid(),
 attendance_id uuid not null references public.campus_class_attendance(id) on delete cascade,
 session_id uuid not null references public.campus_class_sessions(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 old_status text,
 new_status text not null check(new_status in ('present','absent','late')),
 changed_by uuid not null references public.profiles(id) on delete restrict,
 changed_at timestamptz not null default now()
);

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

create table if not exists public.shieldmind_planner_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  kind text not null default 'revision' check (kind in ('revision','class','assignment','exam','reminder')),
  details text not null default '' check (char_length(details) <= 1000),
  starts_at timestamptz,
  remind_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.campus_opportunity_bookmarks (
  opportunity_id uuid not null references public.campus_opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id,user_id)
);
create index if not exists campus_opportunity_bookmarks_user_created_idx on public.campus_opportunity_bookmarks(user_id,created_at desc);
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
create index if not exists campus_courses_campus_status_idx on public.campus_courses(university_id,status,course_code);
create table if not exists public.campus_course_resources (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  course_id uuid references public.campus_courses(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  resource_type text not null check (resource_type in ('lecture_notes','past_question','reading','video','website','slides','other')),
  source_url text not null check (char_length(source_url) <= 2048 and source_url ~* '^https?://[^[:space:]]+$'),
  source_label text not null default 'External resource' check (char_length(btrim(source_label)) between 2 and 120),
  status text not null default 'pending' check (status in ('pending','published','rejected','archived')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campus_course_resources_campus_status_idx on public.campus_course_resources(university_id,status,created_at desc);


-- Existing CampusPulse tables need campus keys so reads and actions remain university-scoped.
alter table public.community_posts add column if not exists university_id uuid references public.campus_universities(id) on delete restrict;
alter table public.community_posts add column if not exists reposted_from_id uuid references public.community_posts(id) on delete set null;
alter table public.community_comments add column if not exists parent_comment_id uuid references public.community_comments(id) on delete cascade;
create index if not exists community_posts_university_status_created_idx on public.community_posts(university_id,status,created_at desc);
create index if not exists community_comments_parent_idx on public.community_comments(parent_comment_id,created_at);

alter table public.community_posts add column if not exists university_id uuid references public.campus_universities(id) on delete restrict;
alter table public.community_posts add column if not exists reposted_from_id uuid references public.community_posts(id) on delete set null;
alter table public.community_comments add column if not exists parent_comment_id uuid
  references public.community_comments(id) on delete cascade;
alter table public.campus_groups add column if not exists creator_username text;
alter table public.campus_events add column if not exists organizer_username text;
alter table public.campus_marketplace_listings add column if not exists seller_username text;

create index if not exists campus_university_requests_status_idx
  on public.campus_university_requests (status, created_at);
create index if not exists campus_groups_campus_idx on public.campus_groups(university_id,status,name);
create index if not exists campus_events_campus_start_idx on public.campus_events(university_id,status,starts_at);
create index if not exists campus_marketplace_campus_idx on public.campus_marketplace_listings(university_id,status,created_at desc);
create index if not exists campus_follows_followed_idx
  on public.campus_follows(university_id,followed_id,created_at desc);
create index if not exists community_poll_votes_option_idx on public.community_poll_votes(option_id);
create index if not exists community_post_media_post_idx on public.community_post_media(post_id,created_at);
create index if not exists campus_marketplace_reports_queue_idx
  on public.campus_marketplace_reports(university_id,status,created_at);
create index if not exists campus_helpdesk_tickets_campus_status_created_idx
  on public.campus_helpdesk_tickets (university_id, status, created_at desc);
create index if not exists campus_helpdesk_tickets_requester_created_idx
  on public.campus_helpdesk_tickets (created_by, created_at desc);
create index if not exists campus_helpdesk_updates_ticket_created_idx
  on public.campus_helpdesk_ticket_updates (ticket_id, created_at asc);
create index if not exists campus_notices_campus_published_idx
  on public.campus_notices (university_id, published_at desc)
  where status = 'published';
create index if not exists campus_classrooms_university_idx on public.campus_classrooms(university_id);
create index if not exists campus_classrooms_teacher_idx on public.campus_classrooms(teacher_id);
create index if not exists campus_classroom_enrollments_student_idx on public.campus_classroom_enrollments(student_id);
create index if not exists campus_classroom_announcements_class_idx on public.campus_classroom_announcements(classroom_id,created_at desc);
create index if not exists campus_classroom_materials_class_idx on public.campus_classroom_materials(classroom_id,created_at desc);
create index if not exists campus_class_sessions_class_idx on public.campus_class_sessions(classroom_id,session_date desc);
create index if not exists campus_class_attendance_session_idx on public.campus_class_attendance(session_id);
create index if not exists campus_opportunities_campus_status_deadline_idx
  on public.campus_opportunities (university_id, status, deadline);
create index if not exists campus_opportunities_owner_created_idx
  on public.campus_opportunities (created_by, created_at desc);
create index if not exists shieldmind_planner_items_owner_schedule_idx
  on public.shieldmind_planner_items(user_id, starts_at nulls last, remind_at nulls last);

-- Private helpers scope every campus action to the signed-in account's active membership.
create or replace function private.current_campus_university_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select cm.university_id
  from public.campus_memberships cm
  where cm.user_id = (select auth.uid())
    and cm.membership_status = 'active'
  limit 1;
$function$;
revoke all on function private.current_campus_university_id() from public, anon;
grant execute on function private.current_campus_university_id() to authenticated;

create or replace function private.current_campus_role()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select p.role::text
  from public.profiles p
  join public.campus_memberships cm on cm.user_id = p.id
  where p.id = (select auth.uid())
    and p.verification_status = 'verified'
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
  limit 1;
$function$;
revoke all on function private.current_campus_role() from public, anon;
grant execute on function private.current_campus_role() to authenticated;

create or replace function private.user_has_current_campus(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.campus_memberships cm
    where cm.user_id = p_user_id
      and cm.university_id = (select private.current_campus_university_id())
      and cm.membership_status = 'active'
  );
$function$;
revoke all on function private.user_has_current_campus(uuid) from public, anon;
grant execute on function private.user_has_current_campus(uuid) to authenticated;

create or replace function private.current_campus_account_status()
returns text language sql stable security definer set search_path to ''
as $function$
  select p.verification_status::text
  from public.profiles p where p.id = (select auth.uid()) limit 1;
$function$;
revoke all on function private.current_campus_account_status() from public, anon;
grant execute on function private.current_campus_account_status() to authenticated;

create or replace function private.is_verified_classroom_teacher(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c
 join public.profiles p on p.id=(select auth.uid())
 join public.campus_memberships m on m.user_id=p.id and m.university_id=c.university_id
 where c.id=p_classroom_id and c.teacher_id=p.id and p.role='teacher' and p.verification_status='verified'
 and m.campus_role='teacher' and m.membership_status='active' and m.verification_status='verified'); $$;
revoke all on function private.is_verified_classroom_teacher(uuid) from public, anon;
grant execute on function private.is_verified_classroom_teacher(uuid) to authenticated;

create or replace function private.can_access_classroom(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c where c.id=p_classroom_id and
 (c.teacher_id=(select auth.uid()) or c.assistant_student_id=(select auth.uid()) or exists(
 select 1 from public.campus_classroom_enrollments e where e.classroom_id=c.id and e.student_id=(select auth.uid())))); $$;
revoke all on function private.can_access_classroom(uuid) from public, anon;
grant execute on function private.can_access_classroom(uuid) to authenticated;

create or replace function private.can_manage_class_attendance(p_classroom_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.campus_classrooms c where c.id=p_classroom_id and
 (private.is_verified_classroom_teacher(c.id) or (c.assistant_student_id=(select auth.uid()) and exists(
 select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student' and p.verification_status='verified')))); $$;
revoke all on function private.can_manage_class_attendance(uuid) from public, anon;
grant execute on function private.can_manage_class_attendance(uuid) to authenticated;

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
revoke all on function private.can_access_classroom(uuid) from public, anon;
grant execute on function private.can_access_classroom(uuid) to authenticated;

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
revoke all on function private.is_verified_classroom_teacher(uuid) from public, anon;
grant execute on function private.is_verified_classroom_teacher(uuid) to authenticated;

create or replace function private.can_manage_class_attendance(p_classroom_id uuid)
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
        private.is_verified_classroom_teacher(c.id)
        or (
          c.assistant_student_id = p.id
          and p.role = 'student'
          and m.campus_role = 'student'
          and exists (
            select 1 from public.campus_classroom_enrollments e
            where e.classroom_id = c.id and e.student_id = p.id
          )
        )
      )
  );
$function$;
revoke all on function private.can_manage_class_attendance(uuid) from public, anon;
grant execute on function private.can_manage_class_attendance(uuid) to authenticated;


-- Enable row-level security on all added campus feature tables.
alter table public.campus_university_requests enable row level security;
alter table public.campus_groups enable row level security;
alter table public.campus_group_members enable row level security;
alter table public.campus_events enable row level security;
alter table public.campus_event_rsvps enable row level security;
alter table public.campus_marketplace_listings enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_post_bookmarks enable row level security;
alter table public.campus_follows enable row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_post_media enable row level security;
alter table public.campus_marketplace_reports enable row level security;
alter table public.campus_helpdesk_tickets enable row level security;
alter table public.campus_helpdesk_ticket_updates enable row level security;
alter table public.campus_notices enable row level security;
alter table public.campus_classrooms enable row level security;
alter table public.campus_classroom_enrollments enable row level security;
alter table public.campus_classroom_announcements enable row level security;
alter table public.campus_classroom_materials enable row level security;
alter table public.campus_class_sessions enable row level security;
alter table public.campus_class_attendance enable row level security;
alter table public.campus_class_attendance_audit enable row level security;
alter table public.campus_opportunities enable row level security;
alter table public.shieldmind_planner_items enable row level security;
alter table public.campus_opportunity_bookmarks enable row level security;
alter table public.campus_courses enable row level security;
alter table public.campus_course_resources enable row level security;

alter table public.campus_opportunity_bookmarks enable row level security;
alter table public.campus_courses enable row level security;
alter table public.campus_course_resources enable row level security;
drop policy if exists campus_opportunity_bookmarks_read_own on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_read_own on public.campus_opportunity_bookmarks for select to authenticated
using (user_id=(select auth.uid()) and university_id=(select private.current_campus_university_id()));
drop policy if exists campus_opportunity_bookmarks_insert_own on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_insert_own on public.campus_opportunity_bookmarks for insert to authenticated
with check (user_id=(select auth.uid()) and university_id=(select private.current_campus_university_id()) and exists (
  select 1 from public.campus_opportunities o where o.id=opportunity_id and o.university_id=university_id and o.status='published' and (o.deadline is null or o.deadline>now())
));
drop policy if exists campus_opportunity_bookmarks_delete_own on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_delete_own on public.campus_opportunity_bookmarks for delete to authenticated
using (user_id=(select auth.uid()) and university_id=(select private.current_campus_university_id()));
drop policy if exists campus_courses_read_campus_published_or_staff on public.campus_courses;
create policy campus_courses_read_campus_published_or_staff on public.campus_courses for select to authenticated
using (university_id=(select private.current_campus_university_id()) and (status='published' or (status='pending' and (select private.current_campus_role())=any(array['admin','security','teacher']))));
drop policy if exists campus_courses_suggest_own on public.campus_courses;
create policy campus_courses_suggest_own on public.campus_courses for insert to authenticated
with check (created_by=(select auth.uid()) and university_id=(select private.current_campus_university_id()) and status='pending');
drop policy if exists campus_courses_review_staff on public.campus_courses;
create policy campus_courses_review_staff on public.campus_courses for update to authenticated
using (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))
with check (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']));
drop policy if exists campus_course_resources_read_campus_published_or_staff on public.campus_course_resources;
create policy campus_course_resources_read_campus_published_or_staff on public.campus_course_resources for select to authenticated
using (university_id=(select private.current_campus_university_id()) and (status='published' or submitted_by=(select auth.uid()) or (status='pending' and (select private.current_campus_role())=any(array['admin','security','teacher']))));
drop policy if exists campus_course_resources_submit_own on public.campus_course_resources;
create policy campus_course_resources_submit_own on public.campus_course_resources for insert to authenticated
with check (submitted_by=(select auth.uid()) and university_id=(select private.current_campus_university_id()) and status='pending' and exists (
  select 1 from public.campus_courses c where c.id=course_id and c.university_id=university_id and c.status='published'
));
drop policy if exists campus_course_resources_review_staff on public.campus_course_resources;
create policy campus_course_resources_review_staff on public.campus_course_resources for update to authenticated
using (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']))
with check (university_id=(select private.current_campus_university_id()) and (select private.current_campus_role())=any(array['admin','security','teacher']));


-- Existing source policy logic is retained only for newly introduced feature tables; no incident/payment/identity policies are replaced.
drop policy if exists campus_university_requests_read_own_or_admin on public.campus_university_requests;
create policy campus_university_requests_read_own_or_admin on public.campus_university_requests
  for select to authenticated using (requester_id = (select auth.uid()));

drop policy if exists campus_groups_read_same_campus on public.campus_groups;
create policy campus_groups_read_same_campus on public.campus_groups for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (status='active' or created_by=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);

drop policy if exists campus_groups_create_same_campus on public.campus_groups;
create policy campus_groups_create_same_campus on public.campus_groups for insert to authenticated
with check (
  private.current_campus_account_status()=any(array['pending','verified'])
  and created_by=(select auth.uid())
  and university_id=(select private.current_campus_university_id())
  and status='pending'
);

drop policy if exists campus_group_members_read_same_campus on public.campus_group_members;
create policy campus_group_members_read_same_campus on public.campus_group_members for select to authenticated
  using (exists (select 1 from public.campus_groups g where g.id = group_id and g.university_id = (select private.current_campus_university_id())));

drop policy if exists campus_group_members_join_same_campus on public.campus_group_members;
create policy campus_group_members_join_same_campus on public.campus_group_members for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and member_role = 'member' and exists (
    select 1 from public.campus_groups g where g.id = group_id and g.university_id = (select private.current_campus_university_id()) and g.status = 'active'
  ));

drop policy if exists campus_group_members_leave_own on public.campus_group_members;
create policy campus_group_members_leave_own on public.campus_group_members for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists campus_events_read_same_campus on public.campus_events;
create policy campus_events_read_same_campus on public.campus_events for select to authenticated
using (
  university_id=(select private.current_campus_university_id())
  and (status='published' or created_by=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);

drop policy if exists campus_events_create_same_campus on public.campus_events;
create policy campus_events_create_same_campus on public.campus_events for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and created_by = (select auth.uid()) and university_id = (select private.current_campus_university_id()) and status = 'pending');

drop policy if exists campus_event_rsvps_read_own on public.campus_event_rsvps;
create policy campus_event_rsvps_read_own on public.campus_event_rsvps for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists campus_event_rsvps_add_own_same_campus on public.campus_event_rsvps;
create policy campus_event_rsvps_add_own_same_campus on public.campus_event_rsvps for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and exists (
    select 1 from public.campus_events e where e.id = event_id and e.university_id = (select private.current_campus_university_id()) and e.status = 'published'
  ));

drop policy if exists campus_event_rsvps_update_own_same_campus on public.campus_event_rsvps;
create policy campus_event_rsvps_update_own_same_campus on public.campus_event_rsvps for update to authenticated
  using (user_id = (select auth.uid()) and private.current_campus_account_status() = any (array['pending','verified']))
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and exists (
    select 1 from public.campus_events e where e.id = event_id and e.university_id = (select private.current_campus_university_id())
  ));

drop policy if exists campus_marketplace_read_same_campus on public.campus_marketplace_listings;
create policy campus_marketplace_read_same_campus on public.campus_marketplace_listings for select to authenticated
using (
  university_id=(select private.current_campus_university_id())
  and (status in ('published','sold') or seller_id=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);

drop policy if exists campus_marketplace_create_same_campus on public.campus_marketplace_listings;
create policy campus_marketplace_create_same_campus on public.campus_marketplace_listings for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and seller_id = (select auth.uid()) and university_id = (select private.current_campus_university_id()) and status = 'pending');

drop policy if exists campus_marketplace_update_own_same_campus on public.campus_marketplace_listings;
create policy campus_marketplace_update_own_same_campus on public.campus_marketplace_listings for update to authenticated
  using (seller_id = (select auth.uid()) and university_id = (select private.current_campus_university_id()))
  with check (
    private.current_campus_account_status() = any (array['pending','verified'])
    and seller_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and status in ('pending','sold')
  );

drop policy if exists community_post_reactions_read_same_campus on public.community_post_reactions;
create policy community_post_reactions_read_same_campus on public.community_post_reactions for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id and p.university_id = (select private.current_campus_university_id()) and p.status = 'published'));

drop policy if exists community_post_reactions_add_same_campus on public.community_post_reactions;
create policy community_post_reactions_add_same_campus on public.community_post_reactions for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and exists (select 1 from public.community_posts p where p.id = post_id and p.university_id = (select private.current_campus_university_id()) and p.status = 'published'));

drop policy if exists community_post_reactions_update_own_same_campus on public.community_post_reactions;
create policy community_post_reactions_update_own_same_campus on public.community_post_reactions for update to authenticated
  using (user_id = (select auth.uid()) and private.current_campus_account_status() = any (array['pending','verified']))
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and exists (select 1 from public.community_posts p where p.id = post_id and p.university_id = (select private.current_campus_university_id())));

drop policy if exists community_post_reactions_delete_own on public.community_post_reactions;
create policy community_post_reactions_delete_own on public.community_post_reactions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists community_post_bookmarks_read_own on public.community_post_bookmarks;
create policy community_post_bookmarks_read_own on public.community_post_bookmarks for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists community_post_bookmarks_add_same_campus on public.community_post_bookmarks;
create policy community_post_bookmarks_add_same_campus on public.community_post_bookmarks for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid()) and exists (select 1 from public.community_posts p where p.id = post_id and p.university_id = (select private.current_campus_university_id()) and p.status = 'published'));

drop policy if exists community_post_bookmarks_delete_own on public.community_post_bookmarks;
create policy community_post_bookmarks_delete_own on public.community_post_bookmarks for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists campus_follows_read_same_campus on public.campus_follows;
create policy campus_follows_read_same_campus on public.campus_follows for select to authenticated
  using (university_id = (select private.current_campus_university_id()));

drop policy if exists campus_follows_add_same_campus on public.campus_follows;
create policy campus_follows_add_same_campus on public.campus_follows for insert to authenticated
  with check (
    private.current_campus_account_status() = any (array['pending','verified'])
    and follower_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and exists (select 1 from public.campus_memberships cm
      where cm.user_id = followed_id and cm.university_id = campus_follows.university_id
        and cm.membership_status = 'active')
  );

drop policy if exists campus_follows_delete_own on public.campus_follows;
create policy campus_follows_delete_own on public.campus_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

drop policy if exists community_poll_options_read_same_campus on public.community_poll_options;
create policy community_poll_options_read_same_campus on public.community_poll_options for select to authenticated
  using (university_id = (select private.current_campus_university_id()) and exists (
    select 1 from public.community_posts p where p.id = post_id and p.university_id = community_poll_options.university_id and p.status = 'published'
  ));

drop policy if exists community_poll_votes_read_own on public.community_poll_votes;
create policy community_poll_votes_read_own on public.community_poll_votes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists community_poll_votes_add_same_campus on public.community_poll_votes;
create policy community_poll_votes_add_same_campus on public.community_poll_votes for insert to authenticated
  with check (
    private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and exists (select 1 from public.community_posts p
      join public.community_poll_options o on o.post_id = p.id
      where p.id = community_poll_votes.post_id and o.id = community_poll_votes.option_id
        and p.post_type = 'poll' and p.status = 'published'
        and p.university_id = community_poll_votes.university_id
        and o.university_id = community_poll_votes.university_id)
  );

drop policy if exists community_poll_votes_update_own_same_campus on public.community_poll_votes;
create policy community_poll_votes_update_own_same_campus on public.community_poll_votes for update to authenticated
  using (user_id = (select auth.uid()) and private.current_campus_account_status() = any (array['pending','verified']))
  with check (
    private.current_campus_account_status() = any (array['pending','verified'])
    and user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and exists (select 1 from public.community_posts p
      where p.id = post_id and p.university_id = community_poll_votes.university_id and p.post_type = 'poll' and p.status = 'published')
  );

drop policy if exists community_post_media_read_same_campus on public.community_post_media;
create policy community_post_media_read_same_campus on public.community_post_media
for select to authenticated using (
  university_id = (select private.current_campus_university_id())
  and exists (
    select 1 from public.community_posts p
    where p.id = community_post_media.post_id
      and p.university_id = community_post_media.university_id
      and (
        p.status = 'published'
        or p.author_id = (select auth.uid())
        or private.current_campus_role() = any (array['admin','security','teacher'])
      )
  )
);

drop policy if exists community_post_media_insert_own_same_campus on public.community_post_media;
create policy community_post_media_insert_own_same_campus on public.community_post_media
for insert to authenticated with check (
  uploader_id = (select auth.uid())
  and private.current_campus_account_status() = any (array['pending','verified'])
  and university_id = (select private.current_campus_university_id())
  and object_path like university_id::text || '/' || post_id::text || '/%'
  and exists (
    select 1 from public.community_posts p
    where p.id = community_post_media.post_id
      and p.author_id = (select auth.uid())
      and p.university_id = community_post_media.university_id
  )
);

drop policy if exists campus_marketplace_reports_read_same_campus_staff on public.campus_marketplace_reports;
create policy campus_marketplace_reports_read_same_campus_staff on public.campus_marketplace_reports
for select to authenticated using (
  university_id=(select private.current_campus_university_id())
  and private.current_campus_role()=any(array['admin','security','teacher'])
);

drop policy if exists campus_helpdesk_tickets_read_owner_or_verified_campus_staff on public.campus_helpdesk_tickets;
create policy campus_helpdesk_tickets_read_owner_or_verified_campus_staff
on public.campus_helpdesk_tickets
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (
    created_by = (select auth.uid())
    or coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
  )
);

drop policy if exists campus_helpdesk_updates_read_ticket_owner_or_staff on public.campus_helpdesk_ticket_updates;
create policy campus_helpdesk_updates_read_ticket_owner_or_staff
on public.campus_helpdesk_ticket_updates
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and exists (
    select 1
    from public.campus_helpdesk_tickets t
    where t.id = campus_helpdesk_ticket_updates.ticket_id
      and t.university_id = campus_helpdesk_ticket_updates.university_id
      and (
        t.created_by = (select auth.uid())
        or coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
      )
  )
);

drop policy if exists campus_notices_read_published_for_campus_audience on public.campus_notices;
create policy campus_notices_read_published_for_campus_audience
on public.campus_notices
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and status = 'published'
  and (expires_at is null or expires_at > now())
  and (
    coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
    or exists (
      select 1
      from public.campus_memberships cm
      where cm.user_id = (select auth.uid())
        and cm.university_id = campus_notices.university_id
        and cm.membership_status = 'active'
        and (
          campus_notices.audience_scope = 'campus'
          or (
            campus_notices.audience_scope = 'faculty'
            and cm.faculty = campus_notices.target_faculty
          )
          or (
            campus_notices.audience_scope = 'department'
            and cm.faculty = campus_notices.target_faculty
            and cm.department = campus_notices.target_department
          )
        )
    )
  )
);

drop policy if exists campus_classrooms_select_members on public.campus_classrooms;
create policy campus_classrooms_select_members on public.campus_classrooms for select to authenticated using(private.can_access_classroom(id));

drop policy if exists campus_classroom_enrollments_select_members on public.campus_classroom_enrollments;
create policy campus_classroom_enrollments_select_members on public.campus_classroom_enrollments for select to authenticated using(private.can_access_classroom(classroom_id));

drop policy if exists campus_classroom_announcements_select_members on public.campus_classroom_announcements;
create policy campus_classroom_announcements_select_members on public.campus_classroom_announcements for select to authenticated using(private.can_access_classroom(classroom_id));

drop policy if exists campus_classroom_announcements_insert_teacher on public.campus_classroom_announcements;
create policy campus_classroom_announcements_insert_teacher on public.campus_classroom_announcements for insert to authenticated with check(author_id=(select auth.uid()) and private.is_verified_classroom_teacher(classroom_id));

drop policy if exists campus_classroom_materials_select_members on public.campus_classroom_materials;
create policy campus_classroom_materials_select_members on public.campus_classroom_materials for select to authenticated using(private.can_access_classroom(classroom_id));

drop policy if exists campus_classroom_materials_insert_teacher on public.campus_classroom_materials;
create policy campus_classroom_materials_insert_teacher on public.campus_classroom_materials for insert to authenticated with check(uploaded_by=(select auth.uid()) and private.is_verified_classroom_teacher(classroom_id));

drop policy if exists campus_class_sessions_select_members on public.campus_class_sessions;
create policy campus_class_sessions_select_members on public.campus_class_sessions for select to authenticated using(private.can_access_classroom(classroom_id));

drop policy if exists campus_class_attendance_select_members on public.campus_class_attendance;
create policy campus_class_attendance_select_members on public.campus_class_attendance for select to authenticated using(exists(select 1 from public.campus_class_sessions s where s.id=session_id and private.can_access_classroom(s.classroom_id)));

drop policy if exists campus_class_attendance_audit_select_teacher on public.campus_class_attendance_audit;
create policy campus_class_attendance_audit_select_teacher on public.campus_class_attendance_audit for select to authenticated using(exists(select 1 from public.campus_class_sessions s where s.id=session_id and private.is_verified_classroom_teacher(s.classroom_id)));

drop policy if exists campus_opportunities_read_same_campus on public.campus_opportunities;
create policy campus_opportunities_read_same_campus
  on public.campus_opportunities for select to authenticated
  using (
    university_id = (select private.current_campus_university_id())
    and (
      (status = 'published' and (deadline is null or deadline > now()))
      or created_by = (select auth.uid())
      or (
        status = 'pending'
        and private.current_campus_role() = any (array['admin','security','teacher'])
      )
    )
  );

drop policy if exists campus_class_attendance_select_authorized on public.campus_class_attendance;
create policy campus_class_attendance_select_authorized
  on public.campus_class_attendance for select to authenticated
  using (
    exists (
      select 1
      from public.campus_class_sessions s
      where s.id = campus_class_attendance.session_id
        and (
          private.is_verified_classroom_teacher(s.classroom_id)
          or (
            campus_class_attendance.student_id = (select auth.uid())
            and private.can_access_classroom(s.classroom_id)
          )
        )
    )
  );

drop policy if exists shieldmind_planner_select_own on public.shieldmind_planner_items;
create policy shieldmind_planner_select_own on public.shieldmind_planner_items
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists shieldmind_planner_insert_own on public.shieldmind_planner_items;
create policy shieldmind_planner_insert_own on public.shieldmind_planner_items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists shieldmind_planner_update_own on public.shieldmind_planner_items;
create policy shieldmind_planner_update_own on public.shieldmind_planner_items
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists shieldmind_planner_delete_own on public.shieldmind_planner_items;
create policy shieldmind_planner_delete_own on public.shieldmind_planner_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- New direct-data APIs are private to signed-in campus members. Policies remain the row-level authority.
grant select, insert, update, delete on table public.campus_university_requests to authenticated;
grant select, insert, update, delete on table public.campus_groups to authenticated;
grant select, insert, update, delete on table public.campus_group_members to authenticated;
grant select, insert, update, delete on table public.campus_events to authenticated;
grant select, insert, update, delete on table public.campus_event_rsvps to authenticated;
grant select, insert, update, delete on table public.campus_marketplace_listings to authenticated;
grant select, insert, update, delete on table public.community_post_reactions to authenticated;
grant select, insert, update, delete on table public.community_post_bookmarks to authenticated;
grant select, insert, update, delete on table public.campus_follows to authenticated;
grant select, insert, update, delete on table public.community_poll_options to authenticated;
grant select, insert, update, delete on table public.community_poll_votes to authenticated;
grant select, insert, update, delete on table public.community_post_media to authenticated;
grant select, insert, update, delete on table public.campus_marketplace_reports to authenticated;
grant select, insert, update, delete on table public.campus_helpdesk_tickets to authenticated;
grant select, insert, update, delete on table public.campus_helpdesk_ticket_updates to authenticated;
grant select, insert, update, delete on table public.campus_notices to authenticated;
grant select, insert, update, delete on table public.campus_classrooms to authenticated;
grant select, insert, update, delete on table public.campus_classroom_enrollments to authenticated;
grant select, insert, update, delete on table public.campus_classroom_announcements to authenticated;
grant select, insert, update, delete on table public.campus_classroom_materials to authenticated;
grant select, insert, update, delete on table public.campus_class_sessions to authenticated;
grant select, insert, update, delete on table public.campus_class_attendance to authenticated;
grant select, insert, update, delete on table public.campus_class_attendance_audit to authenticated;
grant select, insert, update, delete on table public.campus_opportunities to authenticated;
grant select, insert, update, delete on table public.shieldmind_planner_items to authenticated;
grant select, insert, update, delete on table public.campus_opportunity_bookmarks to authenticated;
grant select, insert, update, delete on table public.campus_courses to authenticated;
grant select, insert, update, delete on table public.campus_course_resources to authenticated;
grant select, insert, update, delete on table public.campus_courses, public.campus_course_resources, public.campus_opportunity_bookmarks to authenticated;
revoke all on table public.campus_university_requests from anon;
revoke all on table public.campus_marketplace_reports from anon;
revoke all on table public.campus_helpdesk_tickets, public.campus_helpdesk_ticket_updates, public.campus_notices from anon;

-- New RPCs: private implementations carry the reviewed staged checks; narrow public wrappers expose them to authenticated users only.
create or replace function private.create_community_post_impl(
  p_post_type text,
  p_title text,
  p_body text,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_verification_status text;
  v_username text;
  v_university_id uuid := (select private.current_campus_university_id());
  v_post_id uuid;
  v_is_official boolean := false;
  v_status text := 'pending';
begin
  if v_user_id is null then raise exception 'Sign in before posting to the community.'; end if;
  if v_university_id is null then raise exception 'Choose your university before posting to the campus community.'; end if;

  select p.role::text, p.verification_status::text into v_role, v_verification_status
  from public.profiles p where p.id = v_user_id;
  if not found or v_verification_status not in ('pending','verified') then
    raise exception 'This account cannot post to the community.';
  end if;
  if p_post_type not in ('safety_issue','suggestion','announcement') then raise exception 'Choose a valid community post type.'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 then raise exception 'The title must be 3–100 characters.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 2000 then raise exception 'The post must be 10–2000 characters.'; end if;
  if p_location is not null and char_length(btrim(p_location)) > 120 then raise exception 'The location must be 120 characters or fewer.'; end if;

  if p_post_type = 'announcement' then
    if v_verification_status <> 'verified'
      or v_role not in ('admin','security','teacher')
      or coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then
      raise exception 'Only staff with approved membership for this university can publish official announcements.';
    end if;
    v_is_official := true;
    v_status := 'published';
  end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet. Refresh and try again.'; end if;

  insert into public.community_posts
    (university_id, author_id, author_username, post_type, title, body, location, status, is_official)
  values
    (v_university_id, v_user_id, v_username, p_post_type, btrim(p_title), btrim(p_body),
     nullif(btrim(coalesce(p_location,'')),''), v_status, v_is_official)
  returning id into v_post_id;
  return v_post_id;
end;
$function$;
revoke all on function private.create_community_post_impl(text,text,text,text) from public, anon;
grant execute on function private.create_community_post_impl(text,text,text,text) to authenticated;
create or replace function public.create_community_post(
  p_post_type text,
  p_title text,
  p_body text,
  p_location text default null
)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.create_community_post_impl(p_post_type, p_title, p_body, p_location); end; $wrapper$;
revoke all on function public.create_community_post(text,text,text,text) from public, anon;
grant execute on function public.create_community_post(text,text,text,text) to authenticated;

create or replace function private.create_community_comment_impl(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_verification_status text;
  v_comment_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before commenting.'; end if;
  if v_university_id is null then raise exception 'Choose your university before commenting.'; end if;
  select p.verification_status::text into v_verification_status from public.profiles p where p.id = v_user_id;
  if v_verification_status not in ('pending','verified') then raise exception 'This account cannot comment.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 2 and 800 then raise exception 'Comments must be 2–800 characters.'; end if;
  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id and p.status = 'published' and p.university_id = v_university_id
  ) then raise exception 'This post is not available in your university community.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet. Refresh and try again.'; end if;
  insert into public.community_comments (post_id, author_id, author_username, body, status)
  values (p_post_id, v_user_id, v_username, btrim(p_body), 'published')
  returning id into v_comment_id;
  return v_comment_id;
end;
$function$;
revoke all on function private.create_community_comment_impl(uuid,text) from public, anon;
grant execute on function private.create_community_comment_impl(uuid,text) to authenticated;
create or replace function public.create_community_comment(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.create_community_comment_impl(p_post_id, p_body); end; $wrapper$;
revoke all on function public.create_community_comment(uuid,text) from public, anon;
grant execute on function public.create_community_comment(uuid,text) to authenticated;

create or replace function private.report_community_content_impl(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_target_author uuid;
  v_report_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before reporting content.'; end if;
  if v_university_id is null then raise exception 'Choose your university before reporting community content.'; end if;
  if p_target_type not in ('post','comment') then raise exception 'Choose a valid report target.'; end if;
  if p_reason not in ('spam','harassment','personal_information','misinformation','other') then raise exception 'Choose a valid report reason.'; end if;
  if p_details is not null and char_length(btrim(p_details)) > 500 then raise exception 'Additional details must be 500 characters or fewer.'; end if;

  if p_target_type = 'post' then
    select p.author_id into v_target_author from public.community_posts p
    where p.id = p_target_id and p.status = 'published' and p.university_id = v_university_id;
  else
    select c.author_id into v_target_author from public.community_comments c
    join public.community_posts p on p.id = c.post_id
    where c.id = p_target_id and c.status = 'published' and p.status = 'published'
      and p.university_id = v_university_id;
  end if;
  if not found then raise exception 'The content is not available in your university community.'; end if;
  if v_target_author = v_user_id then raise exception 'You cannot report your own content.'; end if;

  begin
    if p_target_type = 'post' then
      insert into public.community_reports (reporter_id, target_type, post_id, reason, details)
      values (v_user_id, 'post', p_target_id, p_reason, nullif(btrim(coalesce(p_details,'')),'')) returning id into v_report_id;
    else
      insert into public.community_reports (reporter_id, target_type, comment_id, reason, details)
      values (v_user_id, 'comment', p_target_id, p_reason, nullif(btrim(coalesce(p_details,'')),'')) returning id into v_report_id;
    end if;
  exception when unique_violation then raise exception 'You have already reported this content.';
  end;
  return v_report_id;
end;
$function$;
revoke all on function private.report_community_content_impl(text,uuid,text,text) from public, anon;
grant execute on function private.report_community_content_impl(text,uuid,text,text) to authenticated;
create or replace function public.report_community_content(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.report_community_content_impl(p_target_type, p_target_id, p_reason, p_details); end; $wrapper$;
revoke all on function public.report_community_content(text,uuid,text,text) from public, anon;
grant execute on function public.report_community_content(text,uuid,text,text) to authenticated;

create or replace function private.moderate_community_post_impl(p_post_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then raise exception 'Only verified campus staff may moderate community posts.'; end if;
  if v_university_id is null then raise exception 'Choose your university before moderating.'; end if;
  if p_decision not in ('publish','hide','reject') then raise exception 'Decision must be publish, hide, or reject.'; end if;
  update public.community_posts set status = case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end,
    updated_at = now()
  where id = p_post_id and university_id = v_university_id;
  if not found then raise exception 'Community post not found in your university.'; end if;
end;
$function$;
revoke all on function private.moderate_community_post_impl(uuid,text) from public, anon;
grant execute on function private.moderate_community_post_impl(uuid,text) to authenticated;
create or replace function public.moderate_community_post(p_post_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin perform private.moderate_community_post_impl(p_post_id, p_decision); return; end; $wrapper$;
revoke all on function public.moderate_community_post(uuid,text) from public, anon;
grant execute on function public.moderate_community_post(uuid,text) to authenticated;

create or replace function private.moderate_community_comment_impl(p_comment_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then raise exception 'Only verified campus staff may moderate community comments.'; end if;
  if v_university_id is null then raise exception 'Choose your university before moderating.'; end if;
  if p_decision not in ('publish','hide') then raise exception 'Decision must be publish or hide.'; end if;
  update public.community_comments c set status = case p_decision when 'publish' then 'published' else 'hidden' end, updated_at = now()
  where c.id = p_comment_id and exists (
    select 1 from public.community_posts p where p.id = c.post_id and p.university_id = v_university_id
  );
  if not found then raise exception 'Community comment not found in your university.'; end if;
end;
$function$;
revoke all on function private.moderate_community_comment_impl(uuid,text) from public, anon;
grant execute on function private.moderate_community_comment_impl(uuid,text) to authenticated;
create or replace function public.moderate_community_comment(p_comment_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin perform private.moderate_community_comment_impl(p_comment_id, p_decision); return; end; $wrapper$;
revoke all on function public.moderate_community_comment(uuid,text) from public, anon;
grant execute on function public.moderate_community_comment(uuid,text) to authenticated;

create or replace function private.resolve_community_report_impl(p_report_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then raise exception 'Only verified campus staff may review community reports.'; end if;
  if v_university_id is null then raise exception 'Choose your university before reviewing reports.'; end if;
  if p_decision not in ('reviewed','dismissed') then raise exception 'Decision must be reviewed or dismissed.'; end if;
  update public.community_reports r set status = p_decision
  where r.id = p_report_id and (
    exists (select 1 from public.community_posts p where p.id = r.post_id and p.university_id = v_university_id)
    or exists (select 1 from public.community_comments c join public.community_posts p on p.id = c.post_id
      where c.id = r.comment_id and p.university_id = v_university_id)
  );
  if not found then raise exception 'Community report not found in your university.'; end if;
end;
$function$;
revoke all on function private.resolve_community_report_impl(uuid,text) from public, anon;
grant execute on function private.resolve_community_report_impl(uuid,text) to authenticated;
create or replace function public.resolve_community_report(p_report_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin perform private.resolve_community_report_impl(p_report_id, p_decision); return; end; $wrapper$;
revoke all on function public.resolve_community_report(uuid,text) from public, anon;
grant execute on function public.resolve_community_report(uuid,text) to authenticated;

create or replace function private.create_campus_social_post_impl(
  p_post_type text, p_title text, p_body text, p_location text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_status text;
  v_profile_status text;
  v_post_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before posting.'; end if;
  if v_university_id is null then raise exception 'Choose your university before posting.'; end if;
  if p_post_type not in ('campus_update','question','lost_found') then raise exception 'Choose a valid campus post type.'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 then raise exception 'The title must be 3–100 characters.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 2000 then raise exception 'The post must be 10–2000 characters.'; end if;
  if p_location is not null and char_length(btrim(p_location)) > 120 then raise exception 'The location is too long.'; end if;
  select p.verification_status::text into v_profile_status from public.profiles p where p.id=v_user_id;
  if v_profile_status is null or v_profile_status not in ('pending','verified') then raise exception 'This account cannot post.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet.'; end if;
  v_status := 'pending';
  insert into public.community_posts(university_id,author_id,author_username,post_type,title,body,location,status,is_official)
  values(v_university_id,v_user_id,v_username,p_post_type,btrim(p_title),btrim(p_body),
    nullif(btrim(coalesce(p_location,'')),''),v_status,false)
  returning id into v_post_id;
  return v_post_id;
end;
$function$;
revoke all on function private.create_campus_social_post_impl(text,text,text,text) from public, anon;
grant execute on function private.create_campus_social_post_impl(text,text,text,text) to authenticated;
create or replace function public.create_campus_social_post(
  p_post_type text, p_title text, p_body text, p_location text default null
)
returns uuid language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.create_campus_social_post_impl(p_post_type, p_title, p_body, p_location); end; $wrapper$;
revoke all on function public.create_campus_social_post(text,text,text,text) from public, anon;
grant execute on function public.create_campus_social_post(text,text,text,text) to authenticated;

create or replace function private.create_community_poll_impl(
  p_title text, p_body text, p_option_1 text, p_option_2 text,
  p_option_3 text default null, p_option_4 text default null, p_location text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_post_id uuid;
  v_status text;
  v_options text[] := array[
    nullif(btrim(coalesce(p_option_1,'')),''),
    nullif(btrim(coalesce(p_option_2,'')),''),
    nullif(btrim(coalesce(p_option_3,'')),''),
    nullif(btrim(coalesce(p_option_4,'')),'')
  ];
  v_count integer;
  v_option text;
  v_position integer := 0;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before creating a poll.'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 then raise exception 'The poll title must be 3–100 characters.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 2000 then raise exception 'The poll description must be 10–2000 characters.'; end if;
  select count(*) into v_count from unnest(v_options) as item(opt) where opt is not null;
  if v_count < 2 or v_count > 4 then raise exception 'A poll needs 2–4 answer options.'; end if;
  if (select count(distinct lower(opt)) from unnest(v_options) as item(opt) where opt is not null) <> v_count then
    raise exception 'Poll options must be unique.';
  end if;
  if exists(select 1 from unnest(v_options) as item(opt) where opt is not null and char_length(opt)>160) then
    raise exception 'Each poll option must be 160 characters or fewer.';
  end if;
  if p_location is not null and char_length(btrim(p_location))>120 then raise exception 'The location is too long.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet.'; end if;
  select p.verification_status::text into v_status from public.profiles p where p.id=v_user_id;
  if v_status is null or v_status not in ('pending','verified') then raise exception 'This account cannot create a poll.'; end if;
  insert into public.community_posts(university_id,author_id,author_username,post_type,title,body,location,status,is_official)
  values(v_university_id,v_user_id,v_username,'poll',btrim(p_title),btrim(p_body),nullif(btrim(coalesce(p_location,'')),''),'pending',false)
  returning id into v_post_id;
  foreach v_option in array v_options loop
    if v_option is not null then
      insert into public.community_poll_options(post_id,university_id,option_text,position)
      values(v_post_id,v_university_id,v_option,v_position);
      v_position := v_position+1;
    end if;
  end loop;
  return v_post_id;
end;
$function$;
revoke all on function private.create_community_poll_impl(text,text,text,text,text,text,text) from public, anon;
grant execute on function private.create_community_poll_impl(text,text,text,text,text,text,text) to authenticated;
create or replace function public.create_community_poll(
  p_title text, p_body text, p_option_1 text, p_option_2 text,
  p_option_3 text default null, p_option_4 text default null, p_location text default null
)
returns uuid language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.create_community_poll_impl(p_title, p_body, p_option_1, p_option_2, p_option_3, p_option_4, p_location); end; $wrapper$;
revoke all on function public.create_community_poll(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_community_poll(text,text,text,text,text,text,text) to authenticated;

create or replace function private.create_community_reply_impl(p_post_id uuid,p_parent_comment_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_status text;
  v_comment_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before replying.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 2 and 800 then raise exception 'Replies must be 2–800 characters.'; end if;
  select p.verification_status::text into v_status from public.profiles p where p.id=v_user_id;
  if v_status is null or v_status not in ('pending','verified') then raise exception 'This account cannot reply.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then
    raise exception 'This post is not available in your university community.';
  end if;
  if not exists(select 1 from public.community_comments c where c.id=p_parent_comment_id and c.post_id=p_post_id and c.status='published') then
    raise exception 'The comment you are replying to is not available.';
  end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  insert into public.community_comments(post_id,author_id,author_username,parent_comment_id,body,status)
  values(p_post_id,v_user_id,v_username,p_parent_comment_id,btrim(p_body),'published')
  returning id into v_comment_id;
  return v_comment_id;
end;
$function$;
revoke all on function private.create_community_reply_impl(uuid,uuid,text) from public, anon;
grant execute on function private.create_community_reply_impl(uuid,uuid,text) to authenticated;
create or replace function public.create_community_reply(p_post_id uuid,p_parent_comment_id uuid,p_body text)
returns uuid language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.create_community_reply_impl(p_post_id, p_parent_comment_id, p_body); end; $wrapper$;
revoke all on function public.create_community_reply(uuid,uuid,text) from public, anon;
grant execute on function public.create_community_reply(uuid,uuid,text) to authenticated;

create or replace function private.toggle_community_reaction_impl(p_post_id uuid,p_reaction_type text default 'like')
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_exists boolean;
  v_count bigint;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before reacting.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot react to posts.'; end if;
  if p_reaction_type not in ('like','support','celebrate','helpful') then raise exception 'Choose a valid reaction.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then
    raise exception 'This post is not available in your university community.';
  end if;
  select exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id) into v_exists;
  if v_exists then
    if exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id and r.reaction_type=p_reaction_type) then
      delete from public.community_post_reactions where post_id=p_post_id and user_id=v_user_id;
    else
      update public.community_post_reactions set reaction_type=p_reaction_type where post_id=p_post_id and user_id=v_user_id;
    end if;
  else
    insert into public.community_post_reactions(post_id,user_id,reaction_type) values(p_post_id,v_user_id,p_reaction_type);
  end if;
  select count(*) into v_count from public.community_post_reactions r where r.post_id=p_post_id;
  return jsonb_build_object('reacted',exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id),
    'count',v_count);
end;
$function$;
revoke all on function private.toggle_community_reaction_impl(uuid,text) from public, anon;
grant execute on function private.toggle_community_reaction_impl(uuid,text) to authenticated;
create or replace function public.toggle_community_reaction(p_post_id uuid,p_reaction_type text default 'like')
returns jsonb language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.toggle_community_reaction_impl(p_post_id, p_reaction_type); end; $wrapper$;
revoke all on function public.toggle_community_reaction(uuid,text) from public, anon;
grant execute on function public.toggle_community_reaction(uuid,text) to authenticated;

create or replace function private.toggle_community_bookmark_impl(p_post_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_exists boolean;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before bookmarking.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot bookmark posts.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then
    raise exception 'This post is not available in your university community.';
  end if;
  select exists(select 1 from public.community_post_bookmarks b where b.post_id=p_post_id and b.user_id=v_user_id) into v_exists;
  if v_exists then
    delete from public.community_post_bookmarks where post_id=p_post_id and user_id=v_user_id;
    return false;
  end if;
  insert into public.community_post_bookmarks(post_id,user_id) values(p_post_id,v_user_id);
  return true;
end;
$function$;
revoke all on function private.toggle_community_bookmark_impl(uuid) from public, anon;
grant execute on function private.toggle_community_bookmark_impl(uuid) to authenticated;
create or replace function public.toggle_community_bookmark(p_post_id uuid)
returns boolean language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.toggle_community_bookmark_impl(p_post_id); end; $wrapper$;
revoke all on function public.toggle_community_bookmark(uuid) from public, anon;
grant execute on function public.toggle_community_bookmark(uuid) to authenticated;

create or replace function private.get_community_post_social_impl(p_post_ids uuid[])
returns table(post_id uuid,reaction_count bigint,user_reaction text,is_bookmarked boolean,following_author boolean,is_my_post boolean)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university.'; end if;
  if coalesce(cardinality(p_post_ids),0)>50 then raise exception 'Load no more than 50 posts at a time.'; end if;
  return query
    select p.id,
      (select count(*) from public.community_post_reactions r where r.post_id=p.id),
      (select r.reaction_type from public.community_post_reactions r where r.post_id=p.id and r.user_id=v_user_id),
      exists(select 1 from public.community_post_bookmarks b where b.post_id=p.id and b.user_id=v_user_id),
      exists(select 1 from public.campus_follows f where f.follower_id=v_user_id and f.followed_id=p.author_id and f.university_id=v_university_id),
      p.author_id=v_user_id
    from public.community_posts p
    where p.id=any(coalesce(p_post_ids,array[]::uuid[]))
      and p.university_id=v_university_id and p.status='published';
end;
$function$;
revoke all on function private.get_community_post_social_impl(uuid[]) from public, anon;
grant execute on function private.get_community_post_social_impl(uuid[]) to authenticated;
create or replace function public.get_community_post_social(p_post_ids uuid[])
returns table(post_id uuid,reaction_count bigint,user_reaction text,is_bookmarked boolean,following_author boolean,is_my_post boolean)
language plpgsql stable security invoker set search_path to ''
 as $wrapper$ begin return query select * from private.get_community_post_social_impl(p_post_ids); end; $wrapper$;
revoke all on function public.get_community_post_social(uuid[]) from public, anon;
grant execute on function public.get_community_post_social(uuid[]) to authenticated;

create or replace function private.get_community_poll_data_impl(p_post_id uuid)
returns table(option_id uuid,option_text text,"position" integer,vote_count bigint,my_vote boolean)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published' and p.post_type='poll') then
    raise exception 'This poll is not available in your university community.';
  end if;
  return query
    select o.id,o.option_text,o.position,
      (select count(*) from public.community_poll_votes v where v.option_id=o.id),
      exists(select 1 from public.community_poll_votes v where v.option_id=o.id and v.user_id=v_user_id)
    from public.community_poll_options o where o.post_id=p_post_id and o.university_id=v_university_id order by o.position;
end;
$function$;
revoke all on function private.get_community_poll_data_impl(uuid) from public, anon;
grant execute on function private.get_community_poll_data_impl(uuid) to authenticated;
create or replace function public.get_community_poll_data(p_post_id uuid)
returns table(option_id uuid,option_text text,"position" integer,vote_count bigint,my_vote boolean)
language plpgsql stable security invoker set search_path to ''
 as $wrapper$ begin return query select * from private.get_community_poll_data_impl(p_post_id); end; $wrapper$;
revoke all on function public.get_community_poll_data(uuid) from public, anon;
grant execute on function public.get_community_poll_data(uuid) to authenticated;

create or replace function private.vote_community_poll_impl(p_post_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before voting.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot vote in polls.'; end if;
  if not exists(select 1 from public.community_posts p join public.community_poll_options o on o.post_id=p.id
    where p.id=p_post_id and o.id=p_option_id and p.post_type='poll' and p.status='published'
      and p.university_id=v_university_id and o.university_id=v_university_id) then
    raise exception 'This poll is not available in your university community.';
  end if;
  insert into public.community_poll_votes(post_id,option_id,university_id,user_id)
    values(p_post_id,p_option_id,v_university_id,v_user_id)
  on conflict(post_id,user_id) do update set option_id=excluded.option_id,university_id=excluded.university_id,created_at=now();
end;
$function$;
revoke all on function private.vote_community_poll_impl(uuid,uuid) from public, anon;
grant execute on function private.vote_community_poll_impl(uuid,uuid) to authenticated;
create or replace function public.vote_community_poll(p_post_id uuid,p_option_id uuid)
returns void language plpgsql security invoker set search_path to ''
 as $wrapper$ begin perform private.vote_community_poll_impl(p_post_id, p_option_id); return; end; $wrapper$;
revoke all on function public.vote_community_poll(uuid,uuid) from public, anon;
grant execute on function public.vote_community_poll(uuid,uuid) to authenticated;

create or replace function private.repost_community_post_impl(p_post_id uuid)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_source public.community_posts%rowtype;
  v_new_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before reposting.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot repost content.'; end if;
  select * into v_source from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published';
  if not found then raise exception 'This post is not available in your university community.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  insert into public.community_posts(university_id,author_id,author_username,post_type,title,body,location,status,is_official,reposted_from_id)
  values(v_university_id,v_user_id,v_username,'campus_update','Repost: '||left(v_source.title,90),
    left('Shared by @'||v_source.author_username||E'\n\n'||v_source.body,2000),null,'pending',false,p_post_id)
  returning id into v_new_id;
  return v_new_id;
end;
$function$;
revoke all on function private.repost_community_post_impl(uuid) from public, anon;
grant execute on function private.repost_community_post_impl(uuid) to authenticated;
create or replace function public.repost_community_post(p_post_id uuid)
returns uuid language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.repost_community_post_impl(p_post_id); end; $wrapper$;
revoke all on function public.repost_community_post(uuid) from public, anon;
grant execute on function public.repost_community_post(uuid) to authenticated;

create or replace function private.toggle_campus_follow_impl(p_followed_id uuid,p_follow boolean)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before following.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot follow campus members.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot follow campus members.'; end if;
  if p_followed_id=v_user_id then raise exception 'You cannot follow your own profile.'; end if;
  if not exists(select 1 from public.campus_memberships cm where cm.user_id=p_followed_id and cm.university_id=v_university_id and cm.membership_status='active') then
    raise exception 'You can only follow students from your own university.';
  end if;
  if p_follow then
    insert into public.campus_follows(follower_id,followed_id,university_id)
      values(v_user_id,p_followed_id,v_university_id) on conflict(follower_id,followed_id) do nothing;
    return true;
  else
    delete from public.campus_follows where follower_id=v_user_id and followed_id=p_followed_id and university_id=v_university_id;
    return false;
  end if;
end;
$function$;
revoke all on function private.toggle_campus_follow_impl(uuid,boolean) from public, anon;
grant execute on function private.toggle_campus_follow_impl(uuid,boolean) to authenticated;
create or replace function public.toggle_campus_follow(p_followed_id uuid,p_follow boolean)
returns boolean language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.toggle_campus_follow_impl(p_followed_id, p_follow); end; $wrapper$;
revoke all on function public.toggle_campus_follow(uuid,boolean) from public, anon;
grant execute on function public.toggle_campus_follow(uuid,boolean) to authenticated;

create or replace function private.toggle_campus_follow_post_author_impl(p_post_id uuid,p_follow boolean)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_author_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before following.'; end if;
  select p.author_id into v_author_id from public.community_posts p
    where p.id=p_post_id and p.university_id=v_university_id and p.status='published';
  if not found then raise exception 'This post is not available in your university community.'; end if;
  if v_author_id=v_user_id then raise exception 'You cannot follow your own profile.'; end if;
  if p_follow then
    insert into public.campus_follows(follower_id,followed_id,university_id)
    values(v_user_id,v_author_id,v_university_id)
    on conflict(follower_id,followed_id) do nothing;
    return true;
  else
    delete from public.campus_follows
    where follower_id=v_user_id and followed_id=v_author_id and university_id=v_university_id;
    return false;
  end if;
end;
$function$;
revoke all on function private.toggle_campus_follow_post_author_impl(uuid,boolean) from public, anon;
grant execute on function private.toggle_campus_follow_post_author_impl(uuid,boolean) to authenticated;
create or replace function public.toggle_campus_follow_post_author(p_post_id uuid,p_follow boolean)
returns boolean language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.toggle_campus_follow_post_author_impl(p_post_id, p_follow); end; $wrapper$;
revoke all on function public.toggle_campus_follow_post_author(uuid,boolean) from public, anon;
grant execute on function public.toggle_campus_follow_post_author(uuid,boolean) to authenticated;

create or replace function private.list_campus_content_moderation_impl()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce(private.current_campus_role(),'');
  v_result jsonb;
begin
  if v_role not in ('admin','security','teacher') then raise exception 'Verified campus staff access is required.'; end if;
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'group_type',g.group_type,'creator_username',g.creator_username,'created_at',g.created_at))
      from public.campus_groups g where g.university_id=v_university_id and g.status='pending'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'category',e.category,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'organizer_username',e.organizer_username,'created_at',e.created_at))
      from public.campus_events e where e.university_id=v_university_id and e.status='pending'),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'price_ngn',l.price_ngn,'seller_username',l.seller_username,'created_at',l.created_at))
      from public.campus_marketplace_listings l where l.university_id=v_university_id and l.status='pending'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function private.list_campus_content_moderation_impl() from public, anon;
grant execute on function private.list_campus_content_moderation_impl() to authenticated;
create or replace function public.list_campus_content_moderation()
returns jsonb language plpgsql stable security invoker set search_path to ''
 as $wrapper$ begin return private.list_campus_content_moderation_impl(); end; $wrapper$;
revoke all on function public.list_campus_content_moderation() from public, anon;
grant execute on function public.list_campus_content_moderation() to authenticated;

create or replace function private.review_campus_content_impl(p_content_type text,p_content_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required.';
  end if;
  if p_decision not in ('publish','hide','reject') then raise exception 'Decision must be publish, hide, or reject.'; end if;
  if p_content_type='group' then
    update public.campus_groups set status=case p_decision when 'publish' then 'active' when 'hide' then 'hidden' else 'archived' end
      where id=p_content_id and university_id=v_university_id and status='pending';
  elsif p_content_type='event' then
    update public.campus_events set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'cancelled' end
      where id=p_content_id and university_id=v_university_id and status='pending';
  elsif p_content_type='listing' then
    update public.campus_marketplace_listings set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end, updated_at=now()
      where id=p_content_id and university_id=v_university_id and status='pending';
  else
    raise exception 'Unknown campus content type.';
  end if;
  if not found then raise exception 'This item is not waiting for review in your university.'; end if;
end;
$function$;
revoke all on function private.review_campus_content_impl(text,uuid,text) from public, anon;
grant execute on function private.review_campus_content_impl(text,uuid,text) to authenticated;
create or replace function public.review_campus_content(p_content_type text,p_content_id uuid,p_decision text)
returns void language plpgsql security invoker set search_path to ''
 as $wrapper$ begin perform private.review_campus_content_impl(p_content_type, p_content_id, p_decision); return; end; $wrapper$;
revoke all on function public.review_campus_content(text,uuid,text) from public, anon;
grant execute on function public.review_campus_content(text,uuid,text) to authenticated;

create or replace function private.list_my_campus_group_memberships_impl()
returns table(group_id uuid) language sql stable security definer set search_path to ''
as $function$
  select gm.group_id
  from public.campus_group_members gm
  join public.campus_groups g on g.id=gm.group_id
  where gm.user_id=(select auth.uid())
    and g.university_id=(select private.current_campus_university_id())
    and g.status='active';
$function$;
revoke all on function private.list_my_campus_group_memberships_impl() from public, anon;
grant execute on function private.list_my_campus_group_memberships_impl() to authenticated;
create or replace function public.list_my_campus_group_memberships()
returns table(group_id uuid) language sql stable security invoker set search_path to ''
 as $wrapper$ begin return query select * from private.list_my_campus_group_memberships_impl(); end; $wrapper$;
revoke all on function public.list_my_campus_group_memberships() from public, anon;
grant execute on function public.list_my_campus_group_memberships() to authenticated;

create or replace function private.join_campus_group_impl(p_group_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose your university before joining a group.'; end if;
  if private.current_campus_account_status() not in ('pending','verified') then raise exception 'This account cannot join groups.'; end if;
  if not exists(select 1 from public.campus_groups g where g.id=p_group_id and g.university_id=v_university_id and g.status='active') then
    raise exception 'This group is not available in your university.';
  end if;
  insert into public.campus_group_members(group_id,user_id,member_role)
    values(p_group_id,v_user_id,'member') on conflict(group_id,user_id) do nothing;
end;
$function$;
revoke all on function private.join_campus_group_impl(uuid) from public, anon;
grant execute on function private.join_campus_group_impl(uuid) to authenticated;
create or replace function public.join_campus_group(p_group_id uuid)
returns void language plpgsql security invoker set search_path to ''
 as $wrapper$ begin perform private.join_campus_group_impl(p_group_id); return; end; $wrapper$;
revoke all on function public.join_campus_group(uuid) from public, anon;
grant execute on function public.join_campus_group(uuid) to authenticated;

create or replace function private.leave_campus_group_impl(p_group_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose your university first.'; end if;
  delete from public.campus_group_members gm using public.campus_groups g
    where gm.group_id=g.id and gm.group_id=p_group_id and gm.user_id=v_user_id
      and g.university_id=v_university_id;
end;
$function$;
revoke all on function private.leave_campus_group_impl(uuid) from public, anon;
grant execute on function private.leave_campus_group_impl(uuid) to authenticated;
create or replace function public.leave_campus_group(p_group_id uuid)
returns void language plpgsql security invoker set search_path to ''
 as $wrapper$ begin perform private.leave_campus_group_impl(p_group_id); return; end; $wrapper$;
revoke all on function public.leave_campus_group(uuid) from public, anon;
grant execute on function public.leave_campus_group(uuid) to authenticated;

create or replace function private.report_campus_marketplace_listing_impl(
  p_listing_id uuid,p_reason text,p_details text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_seller_id uuid;
  v_id uuid;
begin
  if v_user_id is null or v_university_id is null then
    raise exception 'Sign in and choose your university before reporting a listing.';
  end if;
  if private.current_campus_account_status() not in ('pending','verified') then
    raise exception 'This account cannot report marketplace listings.';
  end if;
  if p_reason not in ('scam_suspicion','spam','unsafe_item','misleading_listing','harassment','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if p_details is not null and char_length(btrim(p_details))>600 then
    raise exception 'Details must be 600 characters or fewer.';
  end if;
  select l.seller_id into v_seller_id
  from public.campus_marketplace_listings l
  where l.id=p_listing_id and l.university_id=v_university_id and l.status in ('published','sold');
  if not found then raise exception 'This listing is not available in your university marketplace.'; end if;
  if v_seller_id=v_user_id then raise exception 'You cannot report your own listing.'; end if;
  insert into public.campus_marketplace_reports(listing_id,university_id,reporter_id,reason,details)
  values(p_listing_id,v_university_id,v_user_id,p_reason,nullif(btrim(coalesce(p_details,'')),''))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already reported this listing.';
end;
$function$;
revoke all on function private.report_campus_marketplace_listing_impl(uuid,text,text) from public, anon;
grant execute on function private.report_campus_marketplace_listing_impl(uuid,text,text) to authenticated;
create or replace function public.report_campus_marketplace_listing(
  p_listing_id uuid,p_reason text,p_details text default null
)
returns uuid language plpgsql security invoker set search_path to ''
 as $wrapper$ begin return private.report_campus_marketplace_listing_impl(p_listing_id, p_reason, p_details); end; $wrapper$;
revoke all on function public.report_campus_marketplace_listing(uuid,text,text) from public, anon;
grant execute on function public.report_campus_marketplace_listing(uuid,text,text) to authenticated;

create or replace function private.list_campus_content_moderation_impl()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce(private.current_campus_role(),'');
  v_result jsonb;
begin
  if v_role not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required.';
  end if;
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'group_type',g.group_type,'creator_username',g.creator_username,'created_at',g.created_at))
      from public.campus_groups g where g.university_id=v_university_id and g.status='pending'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'category',e.category,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'organizer_username',e.organizer_username,'created_at',e.created_at))
      from public.campus_events e where e.university_id=v_university_id and e.status='pending'),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'price_ngn',l.price_ngn,'seller_username',l.seller_username,'created_at',l.created_at))
      from public.campus_marketplace_listings l where l.university_id=v_university_id and l.status='pending'),'[]'::jsonb),
    'listing_reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'listing_id',r.listing_id,'reason',r.reason,'details',r.details,'status',r.status,'created_at',r.created_at,'listing_title',l.title))
      from public.campus_marketplace_reports r join public.campus_marketplace_listings l on l.id=r.listing_id
      where r.university_id=v_university_id and r.status='pending'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function private.list_campus_content_moderation_impl() from public, anon;
grant execute on function private.list_campus_content_moderation_impl() to authenticated;
create or replace function public.list_campus_content_moderation()
returns jsonb language plpgsql stable security invoker set search_path to ''
 as $wrapper$ begin return private.list_campus_content_moderation_impl(); end; $wrapper$;
revoke all on function public.list_campus_content_moderation() from public, anon;
grant execute on function public.list_campus_content_moderation() to authenticated;

create or replace function private.review_campus_marketplace_report_impl(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required.';
  end if;
  if p_decision not in ('reviewed','dismissed','hide_listing') then
    raise exception 'Decision must be reviewed, dismissed, or hide_listing.';
  end if;
  if not exists(select 1 from public.campus_marketplace_reports r
    where r.id=p_report_id and r.university_id=v_university_id and r.status='pending') then
    raise exception 'This marketplace report is not waiting for review in your university.';
  end if;
  if p_decision='hide_listing' then
    update public.campus_marketplace_listings l set status='hidden',updated_at=now()
    from public.campus_marketplace_reports r
    where r.id=p_report_id and l.id=r.listing_id and l.university_id=v_university_id;
    update public.campus_marketplace_reports set status='reviewed',reviewed_at=now() where id=p_report_id;
  else
    update public.campus_marketplace_reports set status=p_decision,reviewed_at=now()
    where id=p_report_id and university_id=v_university_id;
  end if;
end;
$function$;
revoke all on function private.review_campus_marketplace_report_impl(uuid,text) from public, anon;
grant execute on function private.review_campus_marketplace_report_impl(uuid,text) to authenticated;
create or replace function public.review_campus_marketplace_report(p_report_id uuid,p_decision text)
returns void language plpgsql security invoker set search_path to ''
 as $wrapper$ begin perform private.review_campus_marketplace_report_impl(p_report_id, p_decision); return; end; $wrapper$;
revoke all on function public.review_campus_marketplace_report(uuid,text) from public, anon;
grant execute on function public.review_campus_marketplace_report(uuid,text) to authenticated;

create or replace function private.submit_campus_helpdesk_ticket_impl(
  p_category text,
  p_title text,
  p_description text,
  p_location text,
  p_priority text default 'normal'
)
returns table(ticket_id uuid, reference_code text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_ticket_id uuid;
  v_reference_code text;
begin
  if v_user_id is null then raise exception 'Sign in before submitting a campus service request.'; end if;
  if v_university_id is null then raise exception 'Choose your university before submitting a request.'; end if;
  if coalesce((select private.current_campus_account_status()), '') not in ('pending','verified') then
    raise exception 'Your account is not eligible to submit campus requests.';
  end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id and cm.university_id = v_university_id
      and cm.membership_status = 'active'
  ) then raise exception 'An active membership in this university is required.'; end if;
  if p_category not in ('facilities','hostel','wifi_it','classroom_equipment','academic_service','administration','accessibility','other') then
    raise exception 'Choose a valid service category.';
  end if;
  if p_priority not in ('low','normal','high') then raise exception 'Choose a valid priority.'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 4 and 120 then raise exception 'Title must be 4–120 characters.'; end if;
  if char_length(btrim(coalesce(p_description,''))) not between 10 and 3000 then raise exception 'Description must be 10–3000 characters.'; end if;
  if char_length(btrim(coalesce(p_location,''))) > 180 then raise exception 'Location must be 180 characters or fewer.'; end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;

  insert into public.campus_helpdesk_tickets
    (university_id, created_by, created_by_username, category, title, description, location, priority)
  values
    (v_university_id, v_user_id, coalesce(v_username,'campus member'), p_category,
     btrim(p_title), btrim(p_description), nullif(btrim(coalesce(p_location,'')),''), p_priority)
  returning id, campus_helpdesk_tickets.reference_code into v_ticket_id, v_reference_code;

  insert into public.campus_helpdesk_ticket_updates
    (ticket_id, university_id, author_id, author_label, message, from_status, to_status)
  values
    (v_ticket_id, v_university_id, v_user_id, coalesce('@' || v_username,'Campus member'),
     'Request submitted. The campus team can now review and assign this request.', null, 'submitted');

  return query select v_ticket_id, v_reference_code;
end;
$function$;
revoke all on function private.submit_campus_helpdesk_ticket_impl(text,text,text,text,text) from public, anon;
grant execute on function private.submit_campus_helpdesk_ticket_impl(text,text,text,text,text) to authenticated;
create or replace function public.submit_campus_helpdesk_ticket(
  p_category text,
  p_title text,
  p_description text,
  p_location text,
  p_priority text default 'normal'
)
returns table(ticket_id uuid, reference_code text)
language plpgsql
security invoker
set search_path = ''
 as $wrapper$ begin return query select * from private.submit_campus_helpdesk_ticket_impl(p_category, p_title, p_description, p_location, p_priority); end; $wrapper$;
revoke all on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) from public, anon;
grant execute on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) to authenticated;

create or replace function private.update_campus_helpdesk_ticket_impl(
  p_ticket_id uuid,
  p_status text default null,
  p_assigned_department text default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
  v_is_staff boolean := false;
  v_ticket public.campus_helpdesk_tickets%rowtype;
  v_new_status text;
  v_new_department text;
  v_message text := btrim(coalesce(p_message,''));
  v_username text;
  v_author_label text;
begin
  if v_user_id is null then raise exception 'Sign in to update a campus service request.'; end if;
  if v_university_id is null then raise exception 'Choose your university first.'; end if;
  v_is_staff := v_role in ('admin','security','teacher');

  select t.* into v_ticket
  from public.campus_helpdesk_tickets t
  where t.id = p_ticket_id and t.university_id = v_university_id;
  if not found then raise exception 'This request is not available in your university.'; end if;

  if v_ticket.created_by <> v_user_id and not v_is_staff then
    raise exception 'Only the requester or verified campus staff can update this request.';
  end if;
  if v_message <> '' and char_length(v_message) > 1200 then
    raise exception 'Updates must be 1200 characters or fewer.';
  end if;

  v_new_status := v_ticket.status;
  v_new_department := v_ticket.assigned_department;

  if v_is_staff then
    if p_status is not null then
      if p_status not in ('submitted','assigned','in_progress','waiting_student','resolved','closed') then
        raise exception 'Choose a valid request status.';
      end if;
      v_new_status := p_status;
    end if;
    if p_assigned_department is not null then
      if char_length(btrim(p_assigned_department)) > 100 then raise exception 'Department must be 100 characters or fewer.'; end if;
      v_new_department := nullif(btrim(p_assigned_department),'');
    end if;
  else
    if p_status is not null or p_assigned_department is not null then
      raise exception 'Students can add a message but cannot change request status or assignment.';
    end if;
    if v_ticket.status in ('resolved','closed') then
      raise exception 'This request is closed. Contact your campus service team to reopen it.';
    end if;
  end if;

  if v_message = '' and v_new_status = v_ticket.status and v_new_department is not distinct from v_ticket.assigned_department then
    raise exception 'Add an update message or change the status/department.';
  end if;

  if v_message = '' then
    if v_new_status <> v_ticket.status then
      v_message := 'Status updated to ' || replace(v_new_status,'_',' ') || '.';
    else
      v_message := 'Assigned department updated' || case when v_new_department is null then ' and assignment cleared.' else ' to ' || v_new_department || '.' end;
    end if;
  end if;

  update public.campus_helpdesk_tickets
  set status = v_new_status,
      assigned_department = v_new_department,
      updated_at = now(),
      closed_at = case when v_new_status in ('resolved','closed') then coalesce(closed_at,now()) else null end
  where id = v_ticket.id;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;
  v_author_label := case when v_username is not null then '@' || v_username else case when v_is_staff then 'Verified campus staff' else 'Campus member' end end;

  insert into public.campus_helpdesk_ticket_updates
    (ticket_id, university_id, author_id, author_label, message, from_status, to_status, department_to)
  values
    (v_ticket.id, v_university_id, v_user_id, v_author_label, v_message,
     v_ticket.status, v_new_status, v_new_department);
end;
$function$;
revoke all on function private.update_campus_helpdesk_ticket_impl(uuid,text,text,text) from public, anon;
grant execute on function private.update_campus_helpdesk_ticket_impl(uuid,text,text,text) to authenticated;
create or replace function public.update_campus_helpdesk_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_assigned_department text default null,
  p_message text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
 as $wrapper$ begin perform private.update_campus_helpdesk_ticket_impl(p_ticket_id, p_status, p_assigned_department, p_message); return; end; $wrapper$;
revoke all on function public.update_campus_helpdesk_ticket(uuid,text,text,text) from public, anon;
grant execute on function public.update_campus_helpdesk_ticket(uuid,text,text,text) to authenticated;

create or replace function private.publish_campus_notice_impl(
  p_publisher_label text,
  p_title text,
  p_body text,
  p_category text,
  p_audience_scope text default 'campus',
  p_target_faculty text default null,
  p_target_department text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
  v_notice_id uuid;
  v_scope text := coalesce(p_audience_scope,'campus');
  v_faculty text := nullif(btrim(coalesce(p_target_faculty,'')),'');
  v_department text := nullif(btrim(coalesce(p_target_department,'')),'');
  v_label text := btrim(coalesce(p_publisher_label,''));
begin
  if v_user_id is null then raise exception 'Sign in before publishing a campus notice.'; end if;
  if v_university_id is null then raise exception 'Choose your university first.'; end if;
  if v_role not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required to publish official notices.';
  end if;
  if char_length(v_label) not between 2 and 100 then raise exception 'Enter a department or official unit label (2–100 characters).'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 4 and 140 then raise exception 'Notice title must be 4–140 characters.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 5000 then raise exception 'Notice body must be 10–5000 characters.'; end if;
  if p_category not in ('announcement','academic','registration','fees','facilities','closure','events','safety','it_service','other') then
    raise exception 'Choose a valid notice category.';
  end if;
  if v_scope not in ('campus','faculty','department') then raise exception 'Choose a valid notice audience.'; end if;
  if v_scope = 'campus' then
    v_faculty := null; v_department := null;
  elsif v_scope = 'faculty' then
    if v_faculty is null then raise exception 'Choose a faculty for this notice.'; end if;
    v_department := null;
  else
    if v_faculty is null or v_department is null then raise exception 'Choose both a faculty and department for this notice.'; end if;
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Expiry must be in the future.'; end if;

  insert into public.campus_notices
    (university_id, created_by, publisher_label, title, body, category, audience_scope,
     target_faculty, target_department, status, published_at, expires_at)
  values
    (v_university_id, v_user_id, v_label, btrim(p_title), btrim(p_body), p_category,
     v_scope, v_faculty, v_department, 'published', now(), p_expires_at)
  returning id into v_notice_id;

  return v_notice_id;
end;
$function$;
revoke all on function private.publish_campus_notice_impl(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function private.publish_campus_notice_impl(text,text,text,text,text,text,text,timestamptz) to authenticated;
create or replace function public.publish_campus_notice(
  p_publisher_label text,
  p_title text,
  p_body text,
  p_category text,
  p_audience_scope text default 'campus',
  p_target_faculty text default null,
  p_target_department text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
 as $wrapper$ begin return private.publish_campus_notice_impl(p_publisher_label, p_title, p_body, p_category, p_audience_scope, p_target_faculty, p_target_department, p_expires_at); end; $wrapper$;
revoke all on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) to authenticated;

create or replace function private.archive_campus_notice_impl(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
begin
  if v_user_id is null then raise exception 'Sign in to archive a notice.'; end if;
  if v_role not in ('admin','security','teacher') then raise exception 'Verified campus staff membership is required.'; end if;
  update public.campus_notices
    set status='archived', archived_at=now()
    where id=p_notice_id and university_id=v_university_id and status='published';
  if not found then raise exception 'This notice is not active in your university.'; end if;
end;
$function$;
revoke all on function private.archive_campus_notice_impl(uuid) from public, anon;
grant execute on function private.archive_campus_notice_impl(uuid) to authenticated;
create or replace function public.archive_campus_notice(p_notice_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
 as $wrapper$ begin perform private.archive_campus_notice_impl(p_notice_id); return; end; $wrapper$;
revoke all on function public.archive_campus_notice(uuid) from public, anon;
grant execute on function public.archive_campus_notice(uuid) to authenticated;

create or replace function private.create_campus_classroom_impl(p_name text,p_subject text,p_description text default '')
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
revoke all on function private.create_campus_classroom_impl(text,text,text) from public, anon;
grant execute on function private.create_campus_classroom_impl(text,text,text) to authenticated;
create or replace function public.create_campus_classroom(p_name text,p_subject text,p_description text default '')
returns public.campus_classrooms language plpgsql security invoker set search_path=''
 as $wrapper$ begin return private.create_campus_classroom_impl(p_name, p_subject, p_description); end; $wrapper$;
revoke all on function public.create_campus_classroom(text,text,text) from public, anon;
grant execute on function public.create_campus_classroom(text,text,text) to authenticated;

create or replace function private.join_campus_classroom_impl(p_join_code text)
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
revoke all on function private.join_campus_classroom_impl(text) from public, anon;
grant execute on function private.join_campus_classroom_impl(text) to authenticated;
create or replace function public.join_campus_classroom(p_join_code text)
returns uuid language plpgsql security invoker set search_path=''
 as $wrapper$ begin return private.join_campus_classroom_impl(p_join_code); end; $wrapper$;
revoke all on function public.join_campus_classroom(text) from public, anon;
grant execute on function public.join_campus_classroom(text) to authenticated;

create or replace function private.list_campus_classroom_roster_impl(p_classroom_id uuid)
returns table(student_id uuid,display_name text,is_assistant boolean) language plpgsql security definer set search_path=''
as $$ begin
 if not private.can_access_classroom(p_classroom_id) then raise exception 'You are not a member of this class.' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(btrim(p.display_name),''),'Student'),(c.assistant_student_id=p.id)
 from public.campus_classroom_enrollments e join public.profiles p on p.id=e.student_id join public.campus_classrooms c on c.id=e.classroom_id
 where e.classroom_id=p_classroom_id order by coalesce(nullif(btrim(p.display_name),''),'Student');
end; $$;
revoke all on function private.list_campus_classroom_roster_impl(uuid) from public, anon;
grant execute on function private.list_campus_classroom_roster_impl(uuid) to authenticated;
create or replace function public.list_campus_classroom_roster(p_classroom_id uuid)
returns table(student_id uuid,display_name text,is_assistant boolean) language plpgsql security invoker set search_path=''
 as $wrapper$ begin return query select * from private.list_campus_classroom_roster_impl(p_classroom_id); end; $wrapper$;
revoke all on function public.list_campus_classroom_roster(uuid) from public, anon;
grant execute on function public.list_campus_classroom_roster(uuid) to authenticated;

create or replace function private.join_campus_classroom_impl(p_join_code text)
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
revoke all on function private.join_campus_classroom_impl(text) from public, anon;
grant execute on function private.join_campus_classroom_impl(text) to authenticated;
create or replace function public.join_campus_classroom(p_join_code text)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.join_campus_classroom_impl(p_join_code); end; $wrapper$;
revoke all on function public.join_campus_classroom(text) from public, anon;
grant execute on function public.join_campus_classroom(text) to authenticated;

create or replace function private.create_campus_classroom_announcement_impl(
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
revoke all on function private.create_campus_classroom_announcement_impl(uuid,text,text) from public, anon;
grant execute on function private.create_campus_classroom_announcement_impl(uuid,text,text) to authenticated;
create or replace function public.create_campus_classroom_announcement(
  p_classroom_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.create_campus_classroom_announcement_impl(p_classroom_id, p_title, p_body); end; $wrapper$;
revoke all on function public.create_campus_classroom_announcement(uuid,text,text) from public, anon;
grant execute on function public.create_campus_classroom_announcement(uuid,text,text) to authenticated;

create or replace function private.create_campus_classroom_material_impl(
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
revoke all on function private.create_campus_classroom_material_impl(uuid,text,text,text) from public, anon;
grant execute on function private.create_campus_classroom_material_impl(uuid,text,text,text) to authenticated;
create or replace function public.create_campus_classroom_material(
  p_classroom_id uuid,
  p_title text,
  p_description text,
  p_resource_url text
)
returns uuid
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return private.create_campus_classroom_material_impl(p_classroom_id, p_title, p_description, p_resource_url); end; $wrapper$;
revoke all on function public.create_campus_classroom_material(uuid,text,text,text) from public, anon;
grant execute on function public.create_campus_classroom_material(uuid,text,text,text) to authenticated;

create or replace function private.list_campus_classroom_roster_impl(p_classroom_id uuid)
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
revoke all on function private.list_campus_classroom_roster_impl(uuid) from public, anon;
grant execute on function private.list_campus_classroom_roster_impl(uuid) to authenticated;
create or replace function public.list_campus_classroom_roster(p_classroom_id uuid)
returns table(student_id uuid, display_name text, is_assistant boolean)
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_campus_classroom_roster_impl(p_classroom_id); end; $wrapper$;
revoke all on function public.list_campus_classroom_roster(uuid) from public, anon;
grant execute on function public.list_campus_classroom_roster(uuid) to authenticated;

create or replace function private.create_campus_opportunity_impl(
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
revoke all on function private.create_campus_opportunity_impl(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function private.create_campus_opportunity_impl(text,text,text,text,text,text,text,timestamptz) to authenticated;
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
security invoker
set search_path to ''
 as $wrapper$ begin return private.create_campus_opportunity_impl(p_title, p_category, p_description, p_eligibility, p_provider_name, p_source_url, p_contact_url, p_deadline); end; $wrapper$;
revoke all on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) to authenticated;

create or replace function private.update_my_campus_opportunity_impl(
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
revoke all on function private.update_my_campus_opportunity_impl(uuid,text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function private.update_my_campus_opportunity_impl(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
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
security invoker
set search_path to ''
 as $wrapper$ begin perform private.update_my_campus_opportunity_impl(p_opportunity_id, p_title, p_category, p_description, p_eligibility, p_provider_name, p_source_url, p_contact_url, p_deadline); return; end; $wrapper$;
revoke all on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;

create or replace function private.submit_campus_opportunity_impl(p_opportunity_id uuid)
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
revoke all on function private.submit_campus_opportunity_impl(uuid) from public, anon;
grant execute on function private.submit_campus_opportunity_impl(uuid) to authenticated;
create or replace function public.submit_campus_opportunity(p_opportunity_id uuid)
returns void
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin perform private.submit_campus_opportunity_impl(p_opportunity_id); return; end; $wrapper$;
revoke all on function public.submit_campus_opportunity(uuid) from public, anon;
grant execute on function public.submit_campus_opportunity(uuid) to authenticated;

create or replace function private.list_my_campus_opportunities_impl()
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
revoke all on function private.list_my_campus_opportunities_impl() from public, anon;
grant execute on function private.list_my_campus_opportunities_impl() to authenticated;
create or replace function public.list_my_campus_opportunities()
returns table (
  id uuid, title text, category text, description text, eligibility text,
  provider_name text, source_url text, contact_url text, deadline timestamptz,
  status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_my_campus_opportunities_impl(); end; $wrapper$;
revoke all on function public.list_my_campus_opportunities() from public, anon;
grant execute on function public.list_my_campus_opportunities() to authenticated;

create or replace function private.review_campus_opportunity_impl(
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
revoke all on function private.review_campus_opportunity_impl(uuid,text,text) from public, anon;
grant execute on function private.review_campus_opportunity_impl(uuid,text,text) to authenticated;
create or replace function public.review_campus_opportunity(
  p_opportunity_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns void
language plpgsql
security invoker
set search_path to ''
 as $wrapper$ begin perform private.review_campus_opportunity_impl(p_opportunity_id, p_decision, p_review_notes); return; end; $wrapper$;
revoke all on function public.review_campus_opportunity(uuid,text,text) from public, anon;
grant execute on function public.review_campus_opportunity(uuid,text,text) to authenticated;

create or replace function private.list_my_campus_classrooms_impl()
returns table (
  id uuid, university_id uuid, name text, subject text, description text,
  created_at timestamptz, updated_at timestamptz
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
    select c.id, c.university_id, c.name, c.subject, c.description, c.created_at, c.updated_at
    from public.campus_classrooms c
    where c.university_id = (select private.current_campus_university_id())
      and private.can_access_classroom(c.id)
    order by c.created_at desc
    limit 100;
end;
$function$;
revoke all on function private.list_my_campus_classrooms_impl() from public, anon;
grant execute on function private.list_my_campus_classrooms_impl() to authenticated;
create or replace function public.list_my_campus_classrooms()
returns table (
  id uuid, university_id uuid, name text, subject text, description text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_my_campus_classrooms_impl(); end; $wrapper$;
revoke all on function public.list_my_campus_classrooms() from public, anon;
grant execute on function public.list_my_campus_classrooms() to authenticated;

create or replace function private.list_campus_classroom_announcements_impl(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not private.can_access_classroom(p_classroom_id) then
    raise exception 'You are not authorized to access this classroom.' using errcode = '42501';
  end if;
  return query
    select a.id, a.classroom_id, a.title, a.body, a.created_at
    from public.campus_classroom_announcements a
    where a.classroom_id = p_classroom_id
    order by a.created_at desc
    limit 50;
end;
$function$;
revoke all on function private.list_campus_classroom_announcements_impl(uuid) from public, anon;
grant execute on function private.list_campus_classroom_announcements_impl(uuid) to authenticated;
create or replace function public.list_campus_classroom_announcements(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, body text, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_campus_classroom_announcements_impl(p_classroom_id); end; $wrapper$;
revoke all on function public.list_campus_classroom_announcements(uuid) from public, anon;
grant execute on function public.list_campus_classroom_announcements(uuid) to authenticated;

create or replace function private.list_campus_classroom_materials_impl(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, description text, resource_url text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not private.can_access_classroom(p_classroom_id) then
    raise exception 'You are not authorized to access this classroom.' using errcode = '42501';
  end if;
  return query
    select m.id, m.classroom_id, m.title, m.description, m.resource_url, m.created_at
    from public.campus_classroom_materials m
    where m.classroom_id = p_classroom_id
    order by m.created_at desc
    limit 100;
end;
$function$;
revoke all on function private.list_campus_classroom_materials_impl(uuid) from public, anon;
grant execute on function private.list_campus_classroom_materials_impl(uuid) to authenticated;
create or replace function public.list_campus_classroom_materials(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, description text, resource_url text, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_campus_classroom_materials_impl(p_classroom_id); end; $wrapper$;
revoke all on function public.list_campus_classroom_materials(uuid) from public, anon;
grant execute on function public.list_campus_classroom_materials(uuid) to authenticated;

create or replace function private.list_campus_opportunities_impl()
returns table (
  id uuid, university_id uuid, title text, category text, description text,
  eligibility text, provider_name text, source_url text, contact_url text,
  deadline timestamptz, status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_campus uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
begin
  if (select auth.uid()) is null or v_campus is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  return query
    select o.id, o.university_id, o.title, o.category, o.description,
      o.eligibility, o.provider_name, o.source_url, o.contact_url, o.deadline,
      o.status, o.is_official, o.created_at, o.updated_at
    from public.campus_opportunities o
    where o.university_id = v_campus
      and (
        (o.status = 'published' and (o.deadline is null or o.deadline > now()))
        or (o.status = 'pending' and v_role = any(array['admin','security','teacher']))
      )
    order by o.created_at desc
    limit 100;
end;
$function$;
revoke all on function private.list_campus_opportunities_impl() from public, anon;
grant execute on function private.list_campus_opportunities_impl() to authenticated;
create or replace function public.list_campus_opportunities()
returns table (
  id uuid, university_id uuid, title text, category text, description text,
  eligibility text, provider_name text, source_url text, contact_url text,
  deadline timestamptz, status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path to ''
 as $wrapper$ begin return query select * from private.list_campus_opportunities_impl(); end; $wrapper$;
revoke all on function public.list_campus_opportunities() from public, anon;
grant execute on function public.list_campus_opportunities() to authenticated;


commit;
