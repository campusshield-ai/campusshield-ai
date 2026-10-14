-- CampusShield AI: privacy-preserving community feed.
-- Additive migration: private incident reporting remains unchanged and private.

begin;

create table if not exists public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  username_changed_at timestamptz,
  constraint community_profiles_username_format
    check (username ~ '^[a-z0-9_]{3,20}$')
);

create unique index if not exists community_profiles_username_lower_uidx
  on public.community_profiles (lower(username));

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  post_type text not null check (post_type in ('safety_issue', 'suggestion', 'announcement')),
  title text not null check (char_length(btrim(title)) between 3 and 100),
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  location text check (location is null or char_length(btrim(location)) <= 120),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden', 'rejected')),
  is_official boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_status_created_idx
  on public.community_posts (status, created_at desc);

create index if not exists community_posts_author_created_idx
  on public.community_posts (author_id, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  body text not null check (char_length(btrim(body)) between 2 and 800),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_comments_post_created_idx
  on public.community_comments (post_id, created_at asc);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'personal_information', 'misinformation', 'other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint community_reports_exactly_one_target check (
    (target_type = 'post' and post_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null and post_id is null)
  )
);

create index if not exists community_reports_status_created_idx
  on public.community_reports (status, created_at desc);

create unique index if not exists community_reports_post_once_idx
  on public.community_reports (reporter_id, post_id)
  where post_id is not null;

create unique index if not exists community_reports_comment_once_idx
  on public.community_reports (reporter_id, comment_id)
  where comment_id is not null;

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists community_posts_read_published_or_staff on public.community_posts;
create policy community_posts_read_published_or_staff
  on public.community_posts for select to authenticated
  using (
    status = 'published'
    or private.current_campus_role() = any (array['admin', 'security', 'teacher'])
  );

drop policy if exists community_comments_read_published_or_staff on public.community_comments;
create policy community_comments_read_published_or_staff
  on public.community_comments for select to authenticated
  using (
    (
      status = 'published'
      and exists (
        select 1 from public.community_posts p
        where p.id = community_comments.post_id and p.status = 'published'
      )
    )
    or private.current_campus_role() = any (array['admin', 'security', 'teacher'])
  );

drop policy if exists community_reports_read_staff on public.community_reports;
create policy community_reports_read_staff
  on public.community_reports for select to authenticated
  using (private.current_campus_role() = any (array['admin', 'security', 'teacher']));

-- Public REST access is column-limited: internal author UUIDs and reporter IDs are never selectable.
revoke all on table public.community_profiles from anon, authenticated;
revoke all on table public.community_posts from anon, authenticated;
revoke all on table public.community_comments from anon, authenticated;
revoke all on table public.community_reports from anon, authenticated;

grant select (id, author_username, post_type, title, body, location, status, is_official, created_at, updated_at)
  on table public.community_posts to authenticated;
grant select (id, post_id, author_username, body, status, created_at, updated_at)
  on table public.community_comments to authenticated;
grant select (id, target_type, post_id, comment_id, reason, details, status, created_at)
  on table public.community_reports to authenticated;

create or replace function public.initialize_community_profile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_meta jsonb := '{}'::jsonb;
  v_username text;
  v_fallback text := 'student_' || substr(replace(new.id::text, '-', ''), 1, 12);
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_meta
  from auth.users as u
  where u.id = new.id;

  v_username := lower(btrim(coalesce(v_meta ->> 'username', '')));

  if v_username !~ '^[a-z0-9_]{3,20}$'
     or v_username = any (array['admin', 'administrator', 'security', 'support', 'official', 'campusshield', 'staff', 'teacher']) then
    v_username := v_fallback;
  end if;

  begin
    insert into public.community_profiles (user_id, username)
    values (new.id, v_username)
    on conflict (user_id) do nothing;
  exception when unique_violation then
    insert into public.community_profiles (user_id, username)
    values (new.id, v_fallback)
    on conflict (user_id) do nothing;
  end;

  return new;
end;
$function$;

revoke all on function public.initialize_community_profile() from public, anon, authenticated;

drop trigger if exists initialize_community_profile_after_profile_insert on public.profiles;
create trigger initialize_community_profile_after_profile_insert
  after insert on public.profiles
  for each row execute function public.initialize_community_profile();

-- Backfill all existing accounts without exposing private profile fields.
insert into public.community_profiles (user_id, username)
select p.id, 'student_' || substr(replace(p.id::text, '-', ''), 1, 12)
from public.profiles as p
where not exists (
  select 1 from public.community_profiles cp where cp.user_id = p.id
)
on conflict (user_id) do nothing;

create or replace function public.get_my_community_profile()
returns table (username text, username_changed_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select cp.username, cp.username_changed_at
  from public.community_profiles as cp
  where cp.user_id = (select auth.uid())
  limit 1;
$function$;

create or replace function public.check_community_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if v_username !~ '^[a-z0-9_]{3,20}$'
     or v_username = any (array['admin', 'administrator', 'security', 'support', 'official', 'campusshield', 'staff', 'teacher']) then
    return false;
  end if;

  return not exists (
    select 1
    from public.community_profiles cp
    where lower(cp.username) = v_username
      and cp.user_id is distinct from (select auth.uid())
  );
end;
$function$;

create or replace function public.set_my_community_username(p_username text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_old_username text;
  v_changed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Sign in before changing your username.';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Use 3–20 characters: lowercase letters, numbers, and underscores only.';
  end if;

  if v_username = any (array['admin', 'administrator', 'security', 'support', 'official', 'campusshield', 'staff', 'teacher']) then
    raise exception 'That username is reserved.';
  end if;

  select cp.username, cp.username_changed_at
    into v_old_username, v_changed_at
  from public.community_profiles cp
  where cp.user_id = v_user_id;

  if not found then
    raise exception 'Your public profile could not be found.';
  end if;

  if v_old_username = v_username then
    return v_old_username;
  end if;

  if v_changed_at is not null and v_changed_at > now() - interval '7 days' then
    raise exception 'For safety, you can change your username once every 7 days.';
  end if;

  begin
    update public.community_profiles
    set username = v_username,
        username_changed_at = now(),
        updated_at = now()
    where user_id = v_user_id;
  exception when unique_violation then
    raise exception 'That username is already taken. Choose another one.';
  end;

  return v_username;
end;
$function$;

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
  v_post_id uuid;
  v_is_official boolean := false;
  v_status text := 'pending';
begin
  if v_user_id is null then
    raise exception 'Sign in before posting to the community.';
  end if;

  select p.role::text, p.verification_status::text
    into v_role, v_verification_status
  from public.profiles p
  where p.id = v_user_id;

  if not found or v_verification_status = 'rejected' then
    raise exception 'This account cannot post to the community.';
  end if;

  if v_verification_status not in ('pending', 'verified') then
    raise exception 'This account cannot post to the community.';
  end if;

  if p_post_type not in ('safety_issue', 'suggestion', 'announcement') then
    raise exception 'Choose a valid community post type.';
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 100 then
    raise exception 'The title must be 3–100 characters.';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) not between 10 and 2000 then
    raise exception 'The post must be 10–2000 characters.';
  end if;

  if p_location is not null and char_length(btrim(p_location)) > 120 then
    raise exception 'The location must be 120 characters or fewer.';
  end if;

  if p_post_type = 'announcement' then
    if v_verification_status <> 'verified'
       or v_role not in ('admin', 'security', 'teacher') then
      raise exception 'Only verified campus staff can publish official announcements.';
    end if;
    v_is_official := true;
    v_status := 'published';
  end if;

  select cp.username into v_username
  from public.community_profiles cp
  where cp.user_id = v_user_id;

  if v_username is null then
    raise exception 'Your public username is not ready yet. Refresh and try again.';
  end if;

  insert into public.community_posts
    (author_id, author_username, post_type, title, body, location, status, is_official)
  values
    (v_user_id, v_username, p_post_type, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_location, '')), ''), v_status, v_is_official)
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
  v_username text;
  v_verification_status text;
  v_comment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before commenting.';
  end if;

  select p.verification_status::text into v_verification_status
  from public.profiles p where p.id = v_user_id;

  if v_verification_status not in ('pending', 'verified') then
    raise exception 'This account cannot comment.';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) not between 2 and 800 then
    raise exception 'Comments must be 2–800 characters.';
  end if;

  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id and p.status = 'published'
  ) then
    raise exception 'This community post is not available for comments.';
  end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;
  if v_username is null then
    raise exception 'Your public username is not ready yet. Refresh and try again.';
  end if;

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
  v_target_author uuid;
  v_report_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before reporting content.';
  end if;

  if p_target_type not in ('post', 'comment') then
    raise exception 'Choose a valid report target.';
  end if;

  if p_reason not in ('spam', 'harassment', 'personal_information', 'misinformation', 'other') then
    raise exception 'Choose a valid report reason.';
  end if;

  if p_details is not null and char_length(btrim(p_details)) > 500 then
    raise exception 'Additional details must be 500 characters or fewer.';
  end if;

  if p_target_type = 'post' then
    select p.author_id into v_target_author
    from public.community_posts p
    where p.id = p_target_id and p.status = 'published';
  else
    select c.author_id into v_target_author
    from public.community_comments c
    join public.community_posts p on p.id = c.post_id
    where c.id = p_target_id and c.status = 'published' and p.status = 'published';
  end if;

  if not found then
    raise exception 'The content is not available to report.';
  end if;

  if v_target_author = v_user_id then
    raise exception 'You cannot report your own content.';
  end if;

  begin
    if p_target_type = 'post' then
      insert into public.community_reports (reporter_id, target_type, post_id, reason, details)
      values (v_user_id, 'post', p_target_id, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
      returning id into v_report_id;
    else
      insert into public.community_reports (reporter_id, target_type, comment_id, reason, details)
      values (v_user_id, 'comment', p_target_id, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
      returning id into v_report_id;
    end if;
  exception when unique_violation then
    raise exception 'You have already reported this content.';
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
begin
  if private.current_campus_role() <> all (array['admin', 'security', 'teacher']) then
    raise exception 'Only verified campus staff may moderate community posts.';
  end if;

  if p_decision not in ('publish', 'hide', 'reject') then
    raise exception 'Decision must be publish, hide, or reject.';
  end if;

  update public.community_posts
  set status = case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end,
      updated_at = now()
  where id = p_post_id;

  if not found then
    raise exception 'Community post not found.';
  end if;
end;
$function$;

create or replace function public.moderate_community_comment(p_comment_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if private.current_campus_role() <> all (array['admin', 'security', 'teacher']) then
    raise exception 'Only verified campus staff may moderate community comments.';
  end if;

  if p_decision not in ('publish', 'hide') then
    raise exception 'Decision must be publish or hide.';
  end if;

  update public.community_comments
  set status = case p_decision when 'publish' then 'published' else 'hidden' end,
      updated_at = now()
  where id = p_comment_id;

  if not found then
    raise exception 'Community comment not found.';
  end if;
end;
$function$;

create or replace function public.resolve_community_report(p_report_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if private.current_campus_role() <> all (array['admin', 'security', 'teacher']) then
    raise exception 'Only verified campus staff may review community reports.';
  end if;

  if p_decision not in ('reviewed', 'dismissed') then
    raise exception 'Decision must be reviewed or dismissed.';
  end if;

  update public.community_reports
  set status = p_decision
  where id = p_report_id;

  if not found then
    raise exception 'Community report not found.';
  end if;
end;
$function$;

revoke all on function public.get_my_community_profile() from public, anon;
revoke all on function public.check_community_username_available(text) from public;
revoke all on function public.set_my_community_username(text) from public, anon;
revoke all on function public.create_community_post(text, text, text, text) from public, anon;
revoke all on function public.create_community_comment(uuid, text) from public, anon;
revoke all on function public.report_community_content(text, uuid, text, text) from public, anon;
revoke all on function public.moderate_community_post(uuid, text) from public, anon;
revoke all on function public.moderate_community_comment(uuid, text) from public, anon;
revoke all on function public.resolve_community_report(uuid, text) from public, anon;

grant execute on function public.get_my_community_profile() to authenticated;
grant execute on function public.check_community_username_available(text) to anon, authenticated;
grant execute on function public.set_my_community_username(text) to authenticated;
grant execute on function public.create_community_post(text, text, text, text) to authenticated;
grant execute on function public.create_community_comment(uuid, text) to authenticated;
grant execute on function public.report_community_content(text, uuid, text, text) to authenticated;
grant execute on function public.moderate_community_post(uuid, text) to authenticated;
grant execute on function public.moderate_community_comment(uuid, text) to authenticated;
grant execute on function public.resolve_community_report(uuid, text) to authenticated;

commit;
