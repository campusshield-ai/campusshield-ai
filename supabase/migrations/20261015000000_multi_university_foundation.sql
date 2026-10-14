-- CampusShield AI: university isolation foundation.
-- Each user belongs to one university at a time. Campus content is filtered in PostgreSQL RLS,
-- not merely hidden by the browser. Cross-university follows, replies, groups, events and trading are not allowed.

begin;

create table if not exists public.campus_universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ownership text not null check (ownership in ('Federal', 'State', 'Private')),
  state text not null,
  source_url text not null default 'https://enuc.nuc.edu.ng/nus',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_universities_name_nonempty check (char_length(btrim(name)) between 3 and 180)
);
create unique index if not exists campus_universities_name_lower_uidx
  on public.campus_universities (lower(name));
create index if not exists campus_universities_lookup_idx
  on public.campus_universities (is_active, state, name);

-- Initial directory records from the NUC Nigerian University System directory.
-- The schema supports the full directory; the remaining official NUC entries must be imported
-- before nationwide public launch. Users can request an entry if theirs is not listed.
insert into public.campus_universities (name, slug, ownership, state) values
('Abia State University, Uturu', 'abia-state-university', 'State', 'Abia'),
('Abubakar Tafawa Balewa University, Bauchi', 'abubakar-tafawa-balewa-university', 'Federal', 'Bauchi'),
('Ahmadu Bello University, Zaria', 'ahmadu-bello-university', 'Federal', 'Kaduna'),
('American University of Nigeria, Yola', 'american-university-of-nigeria', 'Private', 'Adamawa'),
('Babcock University, Ilishan-Remo', 'babcock-university', 'Private', 'Ogun'),
('Bayero University, Kano', 'bayero-university-kano', 'Federal', 'Kano'),
('Bowen University, Iwo', 'bowen-university', 'Private', 'Osun'),
('Covenant University, Ota', 'covenant-university', 'Private', 'Ogun'),
('Delta State University, Abraka', 'delta-state-university', 'State', 'Delta'),
('Ekiti State University, Ado-Ekiti', 'ekiti-state-university', 'State', 'Ekiti'),
('Federal University Dutse', 'federal-university-dutse', 'Federal', 'Jigawa'),
('Federal University Oye-Ekiti', 'federal-university-oye-ekiti', 'Federal', 'Ekiti'),
('Federal University of Technology, Akure', 'federal-university-of-technology-akure', 'Federal', 'Ondo'),
('Federal University of Technology, Minna', 'federal-university-of-technology-minna', 'Federal', 'Niger'),
('Federal University of Technology, Owerri', 'federal-university-of-technology-owerri', 'Federal', 'Imo'),
('Lagos State University, Ojo', 'lagos-state-university', 'State', 'Lagos'),
('Nnamdi Azikiwe University, Awka', 'nnamdi-azikiwe-university', 'Federal', 'Anambra'),
('Obafemi Awolowo University, Ile-Ife', 'obafemi-awolowo-university', 'Federal', 'Osun'),
('Pan-Atlantic University, Lagos', 'pan-atlantic-university', 'Private', 'Lagos'),
('Redeemer''s University, Ede', 'redeemers-university', 'Private', 'Osun'),
('Rivers State University, Port Harcourt', 'rivers-state-university', 'State', 'Rivers'),
('University of Abuja', 'university-of-abuja', 'Federal', 'FCT'),
('University of Benin', 'university-of-benin', 'Federal', 'Edo'),
('University of Calabar', 'university-of-calabar', 'Federal', 'Cross River'),
('University of Ibadan', 'university-of-ibadan', 'Federal', 'Oyo'),
('University of Ilorin', 'university-of-ilorin', 'Federal', 'Kwara'),
('University of Jos', 'university-of-jos', 'Federal', 'Plateau'),
('University of Lagos', 'university-of-lagos', 'Federal', 'Lagos'),
('University of Maiduguri', 'university-of-maiduguri', 'Federal', 'Borno'),
('University of Nigeria, Nsukka', 'university-of-nigeria-nsukka', 'Federal', 'Enugu'),
('University of Port Harcourt', 'university-of-port-harcourt', 'Federal', 'Rivers'),
('University of Uyo', 'university-of-uyo', 'Federal', 'Akwa Ibom'),
('Osun State University, Osogbo', 'osun-state-university', 'State', 'Osun'),
('Kwara State University, Malete', 'kwara-state-university', 'State', 'Kwara'),
('Nasarawa State University, Keffi', 'nasarawa-state-university', 'State', 'Nasarawa'),
('Kano University of Science and Technology, Wudil', 'kano-university-science-technology', 'State', 'Kano'),
('Modibbo Adama University, Yola', 'modibbo-adama-university', 'Federal', 'Adamawa'),
('Michael Okpara University of Agriculture, Umudike', 'michael-okpara-university', 'Federal', 'Abia'),
('Federal University of Agriculture, Abeokuta', 'federal-university-agriculture-abeokuta', 'Federal', 'Ogun'),
('Federal University of Technology, Babura', 'federal-university-technology-babura', 'Federal', 'Jigawa')
on conflict (slug) do update
set name = excluded.name, ownership = excluded.ownership, state = excluded.state, updated_at = now();

create table if not exists public.campus_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  faculty text,
  department text,
  course text,
  year_of_study text,
  membership_status text not null default 'active' check (membership_status in ('active', 'suspended')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_memberships_faculty_len check (faculty is null or char_length(btrim(faculty)) <= 120),
  constraint campus_memberships_department_len check (department is null or char_length(btrim(department)) <= 120),
  constraint campus_memberships_course_len check (course is null or char_length(btrim(course)) <= 120),
  constraint campus_memberships_year_len check (year_of_study is null or char_length(btrim(year_of_study)) <= 30)
);
create index if not exists campus_memberships_university_idx
  on public.campus_memberships (university_id, membership_status);

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
create index if not exists campus_university_requests_status_idx
  on public.campus_university_requests (status, created_at);

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

-- A role only grants campus-staff powers after that staff account's campus membership
-- has been reviewed for this specific university.
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

drop policy if exists "Users can read own profile; verified staff can read profiles" on public.profiles;
create policy "Users can read own profile; verified staff can read profiles"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      private.current_campus_role() = any (array['admin','security','teacher'])
      and private.user_has_current_campus(id)
    )
  );

-- An institution administrator may review accounts only inside their own university.
create or replace function public.review_campus_account(p_user_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
  v_requested_role text;
begin
  select p.role::text, p.verification_status::text
    into v_admin_role, v_admin_status
  from public.profiles p where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin'
     or v_admin_status is distinct from 'verified'
     or coalesce(private.current_campus_role(),'') <> 'admin' then
    raise exception 'A verified administrator with approved membership for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if not private.user_has_current_campus(p_user_id) then raise exception 'This account is not a member of your university.'; end if;

  select p.requested_role::text into v_requested_role
  from public.profiles p
  where p.id = p_user_id and p.verification_status::text = 'pending';
  if not found then raise exception 'Pending account not found.'; end if;
  if v_requested_role not in ('student','teacher') then raise exception 'Only student and teacher requests can be reviewed here.'; end if;

  if p_decision = 'approve' then
    update public.profiles set role = v_requested_role, verification_status = 'verified'
    where id = p_user_id and verification_status::text = 'pending';
  else
    update public.profiles set verification_status = 'rejected'
    where id = p_user_id and verification_status::text = 'pending';
  end if;
  if not found then raise exception 'The account could not be updated.'; end if;
end;
$function$;

alter table public.campus_universities enable row level security;
alter table public.campus_memberships enable row level security;
alter table public.campus_university_requests enable row level security;
drop policy if exists campus_universities_read_active on public.campus_universities;
create policy campus_universities_read_active on public.campus_universities
  for select to anon, authenticated using (is_active);
drop policy if exists campus_memberships_read_own on public.campus_memberships;
create policy campus_memberships_read_own on public.campus_memberships
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists campus_university_requests_read_own_or_admin on public.campus_university_requests;
create policy campus_university_requests_read_own_or_admin on public.campus_university_requests
  for select to authenticated using (requester_id = (select auth.uid()));
revoke all on table public.campus_universities from public;
grant select on table public.campus_universities to anon, authenticated;
revoke all on table public.campus_memberships from anon, authenticated;
revoke all on table public.campus_university_requests from anon, authenticated;

create or replace function public.get_my_campus_context()
returns table (
  university_id uuid,
  university_name text,
  university_slug text,
  state text,
  ownership text,
  membership_status text,
  verification_status text,
  faculty text,
  department text,
  course text,
  year_of_study text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select u.id, u.name, u.slug, u.state, u.ownership,
         cm.membership_status, cm.verification_status,
         cm.faculty, cm.department, cm.course, cm.year_of_study
  from public.campus_memberships cm
  join public.campus_universities u on u.id = cm.university_id
  where cm.user_id = (select auth.uid())
  limit 1;
$function$;

create or replace function public.set_my_campus_membership(
  p_university_id uuid,
  p_faculty text default null,
  p_department text default null,
  p_course text default null,
  p_year_of_study text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
  v_university_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before choosing your university.'; end if;

  select p.verification_status into v_status
  from public.profiles p where p.id = v_user_id;
  if v_status is null or v_status = 'rejected' then
    raise exception 'This account cannot join a campus community.';
  end if;

  if not exists (select 1 from public.campus_universities u where u.id = p_university_id and u.is_active) then
    raise exception 'Choose a university from the directory.';
  end if;

  if p_faculty is not null and char_length(btrim(p_faculty)) > 120 then raise exception 'Faculty must be 120 characters or fewer.'; end if;
  if p_department is not null and char_length(btrim(p_department)) > 120 then raise exception 'Department must be 120 characters or fewer.'; end if;
  if p_course is not null and char_length(btrim(p_course)) > 120 then raise exception 'Course must be 120 characters or fewer.'; end if;
  if p_year_of_study is not null and char_length(btrim(p_year_of_study)) > 30 then raise exception 'Year of study must be 30 characters or fewer.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm where cm.user_id = v_user_id;
  if found then
    if v_university_id = p_university_id then return v_university_id; end if;
    raise exception 'Your university is locked to protect campus privacy. Contact support to request a transfer.';
  end if;

  insert into public.campus_memberships
    (user_id, university_id, faculty, department, course, year_of_study, membership_status, verification_status)
  values
    (v_user_id, p_university_id, nullif(btrim(coalesce(p_faculty,'')), ''),
     nullif(btrim(coalesce(p_department,'')), ''), nullif(btrim(coalesce(p_course,'')), ''),
     nullif(btrim(coalesce(p_year_of_study,'')), ''), 'active', 'unverified')
  returning university_id into v_university_id;
  return v_university_id;
end;
$function$;

create or replace function public.request_campus_university(
  p_university_name text,
  p_state text,
  p_ownership text,
  p_official_website text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to request a university listing.'; end if;
  if char_length(btrim(coalesce(p_university_name,''))) not between 3 and 180 then raise exception 'Enter a valid university name.'; end if;
  if char_length(btrim(coalesce(p_state,''))) not between 2 and 80 then raise exception 'Enter a state or FCT.'; end if;
  if p_ownership not in ('Federal','State','Private') then raise exception 'Select Federal, State, or Private.'; end if;
  if p_official_website is not null and char_length(btrim(p_official_website)) > 250 then raise exception 'Website URL is too long.'; end if;
  if exists (select 1 from public.campus_universities u where lower(u.name) = lower(btrim(p_university_name))) then
    raise exception 'That university is already in the directory.';
  end if;
  insert into public.campus_university_requests (requester_id, university_name, state, ownership, official_website)
  values (v_user_id, btrim(p_university_name), btrim(p_state), p_ownership, nullif(btrim(coalesce(p_official_website,'')), ''))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.initialize_campus_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_meta jsonb := '{}'::jsonb;
  v_university_id uuid;
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta
  from auth.users u where u.id = new.id;

  if coalesce(v_meta ->> 'university_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_university_id := (v_meta ->> 'university_id')::uuid;
    if exists (select 1 from public.campus_universities cu where cu.id = v_university_id and cu.is_active) then
      insert into public.campus_memberships (user_id, university_id)
      values (new.id, v_university_id)
      on conflict (user_id) do nothing;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.initialize_campus_membership() from public, anon, authenticated;
drop trigger if exists initialize_campus_membership_after_profile_insert on public.profiles;
create trigger initialize_campus_membership_after_profile_insert
  after insert on public.profiles for each row execute function public.initialize_campus_membership();

-- When an account has no membership (e.g. an older account), the community page offers a one-time campus selection.
-- Users can only see or moderate posts belonging to their current active university.
alter table public.community_posts add column if not exists university_id uuid references public.campus_universities(id) on delete restrict;
create index if not exists community_posts_university_status_created_idx
  on public.community_posts (university_id, status, created_at desc);
alter table public.incidents add column if not exists university_id uuid references public.campus_universities(id) on delete restrict;
create index if not exists incidents_university_created_idx on public.incidents (university_id, created_at desc);

-- Tenant boundaries for safety reports. A reporter can still see their own legacy incident;
-- staff only sees incidents assigned to their selected university.
drop policy if exists "Active users can read own incidents; verified staff can read all" on public.incidents;
drop policy if exists "Active users can read own incidents; verified staff can read all incidents" on public.incidents;
drop policy if exists "Signed-in non-rejected users can submit their own incidents" on public.incidents;
drop policy if exists "Only verified security and admins can update incidents" on public.incidents;
drop policy if exists "Only verified admins can delete incidents" on public.incidents;
create policy incidents_read_own_or_same_campus_staff on public.incidents
  for select to authenticated using (
    reporter_id = (select auth.uid())
    or (
      private.current_campus_role() = any (array['security','admin'])
      and university_id = (select private.current_campus_university_id())
    )
  );
create policy incidents_insert_own_same_campus on public.incidents
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.verification_status = any (array['pending','verified'])
    )
  );
create policy incidents_update_same_campus_staff on public.incidents
  for update to authenticated using (
    private.current_campus_role() = any (array['security','admin'])
    and university_id = (select private.current_campus_university_id())
  ) with check (
    private.current_campus_role() = any (array['security','admin'])
    and university_id = (select private.current_campus_university_id())
  );
create policy incidents_delete_same_campus_admin on public.incidents
  for delete to authenticated using (
    private.current_campus_role() = 'admin'
    and university_id = (select private.current_campus_university_id())
  );

-- Replace public campus-feed policies with university-aware policies.
drop policy if exists community_posts_read_published_or_staff on public.community_posts;
create policy community_posts_read_same_campus on public.community_posts
  for select to authenticated using (
    university_id = (select private.current_campus_university_id())
    and (
      status = 'published'
      or private.current_campus_role() = any (array['admin','security','teacher'])
    )
  );
drop policy if exists community_comments_read_published_or_staff on public.community_comments;
create policy community_comments_read_same_campus on public.community_comments
  for select to authenticated using (
    exists (
      select 1 from public.community_posts p
      where p.id = community_comments.post_id
        and p.university_id = (select private.current_campus_university_id())
        and (
          (community_comments.status = 'published' and p.status = 'published')
          or private.current_campus_role() = any (array['admin','security','teacher'])
        )
    )
  );
drop policy if exists community_reports_read_staff on public.community_reports;
create policy community_reports_read_same_campus_staff on public.community_reports
  for select to authenticated using (
    private.current_campus_role() = any (array['admin','security','teacher'])
    and (
      exists (select 1 from public.community_posts p
        where p.id = community_reports.post_id
          and p.university_id = (select private.current_campus_university_id()))
      or exists (select 1 from public.community_comments c
        join public.community_posts p on p.id = c.post_id
        where c.id = community_reports.comment_id
          and p.university_id = (select private.current_campus_university_id()))
    )
  );

-- Security-definer RPCs must perform the same tenant checks; RLS alone cannot constrain their owner context.
create or replace function public.create_community_post(
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
    if v_verification_status <> 'verified' or v_role not in ('admin','security','teacher') then
      raise exception 'Only verified campus staff can publish official announcements.';
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

create or replace function public.create_community_comment(p_post_id uuid, p_body text)
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

create or replace function public.report_community_content(
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

create or replace function public.moderate_community_post(p_post_id uuid, p_decision text)
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

create or replace function public.moderate_community_comment(p_comment_id uuid, p_decision text)
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

create or replace function public.resolve_community_report(p_report_id uuid, p_decision text)
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

-- Campus-wide social modules. Every record carries or inherits a university ID.
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
create index if not exists campus_groups_campus_idx on public.campus_groups(university_id,status,name);

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
create index if not exists campus_events_campus_start_idx on public.campus_events(university_id,status,starts_at);

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
create index if not exists campus_marketplace_campus_idx on public.campus_marketplace_listings(university_id,status,created_at desc);

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

-- Reposts can only refer to content from the same university.
alter table public.community_posts add column if not exists reposted_from_id uuid references public.community_posts(id) on delete set null;

alter table public.campus_groups enable row level security;
alter table public.campus_group_members enable row level security;
alter table public.campus_events enable row level security;
alter table public.campus_event_rsvps enable row level security;
alter table public.campus_marketplace_listings enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_post_bookmarks enable row level security;

drop policy if exists campus_groups_read_same_campus on public.campus_groups;
create policy campus_groups_read_same_campus on public.campus_groups for select to authenticated
  using (university_id = (select private.current_campus_university_id()) and status = 'active');
drop policy if exists campus_groups_create_same_campus on public.campus_groups;
create policy campus_groups_create_same_campus on public.campus_groups for insert to authenticated
  with check (private.current_campus_account_status() = any (array['pending','verified'])
    and created_by = (select auth.uid()) and university_id = (select private.current_campus_university_id()));
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
  using (university_id = (select private.current_campus_university_id()) and (status = 'published' or created_by = (select auth.uid())));
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
  using (university_id = (select private.current_campus_university_id()) and (status = 'published' or seller_id = (select auth.uid())));
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

-- Keep personal identifiers out of client queries on campus-wide social tables.
revoke all on table public.campus_groups, public.campus_group_members, public.campus_events,
  public.campus_event_rsvps, public.campus_marketplace_listings,
  public.community_post_reactions, public.community_post_bookmarks from anon, authenticated;
grant select (id, university_id, name, description, group_type, privacy, status, created_at)
  on public.campus_groups to authenticated;
grant insert (university_id, created_by, name, description, group_type, privacy, status)
  on public.campus_groups to authenticated;
grant select (group_id, member_role, created_at) on public.campus_group_members to authenticated;
grant insert (group_id, user_id, member_role) on public.campus_group_members to authenticated;
grant delete on public.campus_group_members to authenticated;
grant select (id, university_id, title, description, category, starts_at, ends_at, location, status, created_at)
  on public.campus_events to authenticated;
grant insert (university_id, created_by, title, description, category, starts_at, ends_at, location, status)
  on public.campus_events to authenticated;
grant select (event_id, response, created_at, updated_at)
  on public.campus_event_rsvps to authenticated;
grant insert (event_id, user_id, response) on public.campus_event_rsvps to authenticated;
grant update (response, updated_at) on public.campus_event_rsvps to authenticated;
grant select (id, university_id, category, title, description, price_ngn, contact_instructions, status, created_at, updated_at)
  on public.campus_marketplace_listings to authenticated;
grant insert (university_id, seller_id, category, title, description, price_ngn, contact_instructions, status)
  on public.campus_marketplace_listings to authenticated;
grant update (title, description, price_ngn, contact_instructions, status, updated_at)
  on public.campus_marketplace_listings to authenticated;
grant select (post_id, reaction_type, created_at) on public.community_post_reactions to authenticated;
grant insert (post_id, user_id, reaction_type) on public.community_post_reactions to authenticated;
grant update (reaction_type) on public.community_post_reactions to authenticated;
grant delete on public.community_post_reactions to authenticated;
grant select (post_id, created_at) on public.community_post_bookmarks to authenticated;
grant insert (post_id, user_id) on public.community_post_bookmarks to authenticated;
grant delete on public.community_post_bookmarks to authenticated;

revoke all on function public.get_my_campus_context() from public, anon;
revoke all on function public.set_my_campus_membership(uuid,text,text,text,text) from public, anon;
revoke all on function public.request_campus_university(text,text,text,text) from public, anon;
grant execute on function public.get_my_campus_context() to authenticated;
grant execute on function public.set_my_campus_membership(uuid,text,text,text,text) to authenticated;
grant execute on function public.request_campus_university(text,text,text,text) to authenticated;

commit;
