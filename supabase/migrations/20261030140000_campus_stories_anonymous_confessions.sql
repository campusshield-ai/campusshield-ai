-- CampusShield AI: campus stories and anonymous confessions.
-- Additive, university-scoped feature set. All reads/writes use narrowly scoped RPCs.
begin;

create table if not exists public.campus_stories (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  constraint campus_stories_expiry_order check (expires_at is null or (published_at is not null and expires_at > published_at))
);
create index if not exists campus_stories_campus_live_idx
  on public.campus_stories(university_id, expires_at desc)
  where status='published';
create index if not exists campus_stories_moderation_idx
  on public.campus_stories(university_id, created_at)
  where status='pending';

create table if not exists public.campus_confessions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('campus_life','friendship','relationships','academic_stress','general')),
  body text not null check (char_length(btrim(body)) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campus_confessions_campus_feed_idx
  on public.campus_confessions(university_id, created_at desc)
  where status='published';
create index if not exists campus_confessions_moderation_idx
  on public.campus_confessions(university_id, created_at)
  where status='pending';

create table if not exists public.campus_confession_reports (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.campus_confessions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','threats','personal_information','self_harm_concern','spam','other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique(confession_id, reporter_id)
);
create index if not exists campus_confession_reports_pending_idx
  on public.campus_confession_reports(created_at desc) where status='pending';

create table if not exists public.campus_confession_identity_audit (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.campus_confessions(id) on delete cascade,
  accessed_by uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (char_length(btrim(purpose)) between 12 and 500),
  created_at timestamptz not null default now()
);
create index if not exists campus_confession_identity_audit_confession_idx
  on public.campus_confession_identity_audit(confession_id, created_at desc);

alter table public.campus_stories enable row level security;
alter table public.campus_confessions enable row level security;
alter table public.campus_confession_reports enable row level security;
alter table public.campus_confession_identity_audit enable row level security;

revoke all on public.campus_stories, public.campus_confessions,
  public.campus_confession_reports, public.campus_confession_identity_audit
  from anon, authenticated;

create or replace function public.create_campus_story(p_body text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_campus uuid := (select private.current_campus_university_id());
  v_username text;
  v_id uuid;
begin
  if v_user is null or v_campus is null then raise exception 'Sign in and select your university first.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to publish a story.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 1 and 500 then
    raise exception 'A story must contain 1–500 characters.';
  end if;
  if (select count(*) from public.campus_stories
      where author_id=v_user and university_id=v_campus and created_at>now()-interval '24 hours') >= 5 then
    raise exception 'You can submit up to five stories in a 24-hour period.';
  end if;
  select username into v_username from public.community_profiles where user_id=v_user;
  if v_username is null then raise exception 'Your campus username is not ready yet.'; end if;
  insert into public.campus_stories(university_id,author_id,author_username,body)
  values(v_campus,v_user,v_username,btrim(p_body)) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_campus_stories()
returns table(story_id uuid, author_username text, body text, created_at timestamptz, expires_at timestamptz, is_mine boolean)
language sql stable security definer set search_path to ''
as $function$
  select s.id,s.author_username,s.body,s.created_at,s.expires_at,(s.author_id=(select auth.uid()))
  from public.campus_stories s
  where s.university_id=(select private.current_campus_university_id())
    and s.status='published' and s.expires_at>now()
    and (select private.current_user_has_verified_campus_access())
  order by s.published_at desc limit 60;
$function$;

create or replace function public.list_campus_story_moderation()
returns table(story_id uuid, author_username text, body text, created_at timestamptz)
language sql stable security definer set search_path to ''
as $function$
  select s.id,s.author_username,s.body,s.created_at
  from public.campus_stories s
  where s.university_id=(select private.current_campus_university_id())
    and s.status='pending'
    and coalesce((select private.current_campus_role()),'')=any(array['admin','security','teacher']::text[])
  order by s.created_at asc limit 100;
$function$;

create or replace function public.moderate_campus_story(p_story_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required to moderate stories.';
  end if;
  if p_decision not in ('publish','reject','hide') then raise exception 'Choose a valid moderation decision.'; end if;
  update public.campus_stories
    set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end,
        published_at=case when p_decision='publish' then now() else published_at end,
        expires_at=case when p_decision='publish' then now()+interval '24 hours' else expires_at end
    where id=p_story_id and university_id=(select private.current_campus_university_id());
  if not found then raise exception 'Story not found in your university.'; end if;
end;
$function$;

create or replace function public.create_campus_confession(p_category text,p_body text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_campus uuid := (select private.current_campus_university_id());
  v_id uuid;
begin
  if v_user is null or v_campus is null then raise exception 'Sign in and select your university first.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to submit a confession.';
  end if;
  if p_category not in ('campus_life','friendship','relationships','academic_stress','general') then
    raise exception 'Choose a valid confession category.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 1200 then
    raise exception 'A confession must contain 10–1,200 characters.';
  end if;
  if (select count(*) from public.campus_confessions
      where author_id=v_user and university_id=v_campus and created_at>now()-interval '24 hours') >= 3 then
    raise exception 'You can submit up to three confessions in a 24-hour period.';
  end if;
  insert into public.campus_confessions(university_id,author_id,category,body)
  values(v_campus,v_user,p_category,btrim(p_body)) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_campus_confessions()
returns table(confession_id uuid, category text, body text, created_at timestamptz)
language sql stable security definer set search_path to ''
as $function$
  select c.id,c.category,c.body,c.created_at
  from public.campus_confessions c
  where c.university_id=(select private.current_campus_university_id())
    and c.status='published'
    and (select private.current_user_has_verified_campus_access())
  order by c.created_at desc limit 100;
$function$;

create or replace function public.list_campus_confession_moderation()
returns table(confession_id uuid, category text, body text, created_at timestamptz, report_count bigint)
language sql stable security definer set search_path to ''
as $function$
  select c.id,c.category,c.body,c.created_at,
    (select count(*) from public.campus_confession_reports r where r.confession_id=c.id and r.status='pending')
  from public.campus_confessions c
  where c.university_id=(select private.current_campus_university_id())
    and c.status='pending'
    and coalesce((select private.current_campus_role()),'')=any(array['admin','security','teacher']::text[])
  order by c.created_at asc limit 100;
$function$;

create or replace function public.moderate_campus_confession(p_confession_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required to moderate confessions.';
  end if;
  if p_decision not in ('publish','reject','hide') then raise exception 'Choose a valid moderation decision.'; end if;
  update public.campus_confessions
    set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end,
        updated_at=now()
    where id=p_confession_id and university_id=(select private.current_campus_university_id());
  if not found then raise exception 'Confession not found in your university.'; end if;
end;
$function$;

create or replace function public.report_campus_confession(p_confession_id uuid,p_reason text,p_details text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid := (select auth.uid()); v_report uuid;
begin
  if v_user is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to report a confession.';
  end if;
  if p_reason not in ('harassment','threats','personal_information','self_harm_concern','spam','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if char_length(btrim(coalesce(p_details,'')))>500 then raise exception 'Details must be 500 characters or fewer.'; end if;
  if not exists(select 1 from public.campus_confessions c
    where c.id=p_confession_id and c.university_id=(select private.current_campus_university_id()) and c.status='published') then
    raise exception 'This confession is not available to report.';
  end if;
  insert into public.campus_confession_reports(confession_id,reporter_id,reason,details)
  values(p_confession_id,v_user,p_reason,nullif(btrim(coalesce(p_details,'')),''))
  returning id into v_report;
  return v_report;
exception when unique_violation then raise exception 'You have already reported this confession.';
end;
$function$;

create or replace function public.list_campus_confession_reports()
returns table(report_id uuid, confession_id uuid, reason text, details text, created_at timestamptz)
language sql stable security definer set search_path to ''
as $function$
  select r.id,r.confession_id,r.reason,r.details,r.created_at
  from public.campus_confession_reports r
  join public.campus_confessions c on c.id=r.confession_id
  where c.university_id=(select private.current_campus_university_id())
    and r.status='pending'
    and coalesce((select private.current_campus_role()),'')=any(array['admin','security','teacher']::text[])
  order by r.created_at asc limit 100;
$function$;

create or replace function public.resolve_campus_confession_report(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher') then
    raise exception 'Verified campus staff access is required to review reports.';
  end if;
  if p_decision not in ('reviewed','dismissed') then raise exception 'Choose a valid report decision.'; end if;
  update public.campus_confession_reports r set status=p_decision
  from public.campus_confessions c
  where r.id=p_report_id and r.confession_id=c.id
    and c.university_id=(select private.current_campus_university_id());
  if not found then raise exception 'Report not found in your university.'; end if;
end;
$function$;

create or replace function public.investigate_campus_confession_author(p_confession_id uuid,p_purpose text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_author uuid; v_actor uuid := (select auth.uid());
begin
  if coalesce((select private.current_campus_role()),'') not in ('admin','security') then
    raise exception 'Only verified campus administrators or security staff may investigate a confession author.';
  end if;
  if char_length(btrim(coalesce(p_purpose,''))) not between 12 and 500 then
    raise exception 'Provide a specific investigation reason (12–500 characters).';
  end if;
  select c.author_id into v_author from public.campus_confessions c
  where c.id=p_confession_id and c.university_id=(select private.current_campus_university_id());
  if not found then raise exception 'Confession not found in your university.'; end if;
  insert into public.campus_confession_identity_audit(confession_id,accessed_by,purpose)
  values(p_confession_id,v_actor,btrim(p_purpose));
  return v_author;
end;
$function$;

revoke all on function public.create_campus_story(text) from public,anon;
revoke all on function public.list_campus_stories() from public,anon;
revoke all on function public.list_campus_story_moderation() from public,anon;
revoke all on function public.moderate_campus_story(uuid,text) from public,anon;
revoke all on function public.create_campus_confession(text,text) from public,anon;
revoke all on function public.list_campus_confessions() from public,anon;
revoke all on function public.list_campus_confession_moderation() from public,anon;
revoke all on function public.moderate_campus_confession(uuid,text) from public,anon;
revoke all on function public.report_campus_confession(uuid,text,text) from public,anon;
revoke all on function public.list_campus_confession_reports() from public,anon;
revoke all on function public.resolve_campus_confession_report(uuid,text) from public,anon;
revoke all on function public.investigate_campus_confession_author(uuid,text) from public,anon;

grant execute on function public.create_campus_story(text) to authenticated;
grant execute on function public.list_campus_stories() to authenticated;
grant execute on function public.list_campus_story_moderation() to authenticated;
grant execute on function public.moderate_campus_story(uuid,text) to authenticated;
grant execute on function public.create_campus_confession(text,text) to authenticated;
grant execute on function public.list_campus_confessions() to authenticated;
grant execute on function public.list_campus_confession_moderation() to authenticated;
grant execute on function public.moderate_campus_confession(uuid,text) to authenticated;
grant execute on function public.report_campus_confession(uuid,text,text) to authenticated;
grant execute on function public.list_campus_confession_reports() to authenticated;
grant execute on function public.resolve_campus_confession_report(uuid,text) to authenticated;
grant execute on function public.investigate_campus_confession_author(uuid,text) to authenticated;

commit;
