-- CampusShield AI Social Ecosystem Phase 3
-- Adds campus-scoped public profile details and in-app social activity notifications.
-- Direct messages, follows, reactions, bookmarks, reposts, events and groups already exist;
-- this migration extends them without creating parallel systems.

begin;

alter table public.community_profiles
  add column if not exists bio text,
  add column if not exists faculty text,
  add column if not exists department text,
  add column if not exists course_of_study text,
  add column if not exists year_of_study text,
  add column if not exists interests text[] not null default '{}';

alter table public.community_profiles
  drop constraint if exists community_profiles_bio_length,
  add constraint community_profiles_bio_length check (bio is null or char_length(btrim(bio)) <= 280),
  drop constraint if exists community_profiles_faculty_length,
  add constraint community_profiles_faculty_length check (faculty is null or char_length(btrim(faculty)) <= 120),
  drop constraint if exists community_profiles_department_length,
  add constraint community_profiles_department_length check (department is null or char_length(btrim(department)) <= 120),
  drop constraint if exists community_profiles_course_length,
  add constraint community_profiles_course_length check (course_of_study is null or char_length(btrim(course_of_study)) <= 120),
  drop constraint if exists community_profiles_year_length,
  add constraint community_profiles_year_length check (year_of_study is null or char_length(btrim(year_of_study)) <= 40),
  drop constraint if exists community_profiles_interests_count,
  add constraint community_profiles_interests_count check (cardinality(interests) <= 12);

create table if not exists public.campus_social_notifications (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('new_follower','post_comment','post_mention','comment_mention')),
  target_type text not null check (target_type in ('profile','post','comment')),
  target_id uuid not null,
  excerpt text check (excerpt is null or char_length(excerpt) <= 180),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint campus_social_notifications_not_self check (recipient_id <> actor_id),
  unique (recipient_id, actor_id, kind, target_id)
);

create index if not exists campus_social_notifications_inbox_idx
  on public.campus_social_notifications(recipient_id, created_at desc);

alter table public.campus_social_notifications enable row level security;
revoke all on public.campus_social_notifications from public, anon, authenticated;

create or replace function private.create_campus_social_notification(
  p_university_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_target_type text,
  p_target_id uuid,
  p_excerpt text default null
) returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if p_recipient_id is null or p_actor_id is null or p_recipient_id = p_actor_id then return; end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=p_recipient_id and cm.university_id=p_university_id
      and cm.membership_status='active' and cm.verification_status='verified'
  ) then return; end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=p_actor_id and cm.university_id=p_university_id
      and cm.membership_status='active' and cm.verification_status='verified'
  ) then return; end if;
  insert into public.campus_social_notifications(
    university_id,recipient_id,actor_id,kind,target_type,target_id,excerpt
  ) values (
    p_university_id,p_recipient_id,p_actor_id,p_kind,p_target_type,p_target_id,
    left(coalesce(p_excerpt,''),180)
  )
  on conflict (recipient_id,actor_id,kind,target_id) do nothing;
end;
$function$;

create or replace function private.notify_campus_social_activity()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
  v_actor uuid;
  v_university uuid;
  v_target uuid;
  v_post_author uuid;
  v_post_id uuid;
  v_text text;
  v_kind text;
  v_username text;
  v_recipient uuid;
begin
  if tg_table_name='campus_follows' then
    perform private.create_campus_social_notification(
      new.university_id,new.followed_id,new.follower_id,'new_follower',
      'profile',new.follower_id,null
    );
    return new;
  elsif tg_table_name='community_posts' then
    if new.status <> 'published' or (tg_op='UPDATE' and old.status='published') then return new; end if;
    v_actor := new.author_id;
    v_university := new.university_id;
    v_target := new.id;
    v_post_id := new.id;
    v_text := coalesce(new.title,'') || ' ' || coalesce(new.body,'');
    v_kind := 'post_mention';
  elsif tg_table_name='community_comments' then
    if new.status <> 'published' then return new; end if;
    select p.author_id,p.university_id,p.id
      into v_post_author,v_university,v_post_id
    from public.community_posts p
    where p.id=new.post_id and p.status='published';
    if not found then return new; end if;
    v_actor := new.author_id;
    v_target := new.id;
    v_text := coalesce(new.body,'');
    if v_post_author is not null then
      perform private.create_campus_social_notification(
        v_university,v_post_author,v_actor,'post_comment','post',v_post_id,
        'A student commented on your campus post.'
      );
    end if;
    v_kind := 'comment_mention';
  else
    return new;
  end if;

  for v_username in
    select distinct lower(captures[1])
    from regexp_matches(v_text,'@([a-z0-9_]{3,20})','g') as matches(captures)
  loop
    select cp.user_id into v_recipient
    from public.community_profiles cp
    join public.campus_memberships cm
      on cm.user_id=cp.user_id and cm.university_id=v_university
    where lower(cp.username)=v_username
      and cm.membership_status='active' and cm.verification_status='verified'
    limit 1;
    if v_recipient is not null then
      perform private.create_campus_social_notification(
        v_university,v_recipient,v_actor,v_kind,
        case when tg_table_name='community_posts' then 'post' else 'comment' end,
        v_target,'You were mentioned in a campus community ' ||
          case when tg_table_name='community_posts' then 'post.' else 'comment.' end
      );
    end if;
    v_recipient := null;
  end loop;
  return new;
end;
$function$;

drop trigger if exists campus_social_follow_notification on public.campus_follows;
create trigger campus_social_follow_notification
  after insert on public.campus_follows
  for each row execute function private.notify_campus_social_activity();

drop trigger if exists campus_social_post_mention_notification on public.community_posts;
create trigger campus_social_post_mention_notification
  after insert or update of status on public.community_posts
  for each row execute function private.notify_campus_social_activity();

drop trigger if exists campus_social_comment_notification on public.community_comments;
create trigger campus_social_comment_notification
  after insert on public.community_comments
  for each row execute function private.notify_campus_social_activity();

create or replace function public.update_my_community_profile_details(
  p_bio text,
  p_faculty text,
  p_department text,
  p_course_of_study text,
  p_year_of_study text,
  p_interests text[]
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_interests text[];
begin
  if v_user is null or v_university is null then
    raise exception 'Sign in and select your university before updating your campus profile.';
  end if;
  if not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to publish profile details.';
  end if;
  if char_length(btrim(coalesce(p_bio,''))) > 280
    or char_length(btrim(coalesce(p_faculty,''))) > 120
    or char_length(btrim(coalesce(p_department,''))) > 120
    or char_length(btrim(coalesce(p_course_of_study,''))) > 120
    or char_length(btrim(coalesce(p_year_of_study,''))) > 40 then
    raise exception 'One or more profile fields exceed their permitted length.';
  end if;
  select coalesce(array_agg(distinct btrim(x)),'{}'::text[])
    into v_interests
  from unnest(coalesce(p_interests,'{}'::text[])) x
  where btrim(x) <> '';
  if cardinality(v_interests)>12 or exists(select 1 from unnest(v_interests) x where char_length(x)>32) then
    raise exception 'Choose up to 12 interests, each no longer than 32 characters.';
  end if;
  update public.community_profiles
  set bio=nullif(btrim(coalesce(p_bio,'')),''),
      faculty=nullif(btrim(coalesce(p_faculty,'')),''),
      department=nullif(btrim(coalesce(p_department,'')),''),
      course_of_study=nullif(btrim(coalesce(p_course_of_study,'')),''),
      year_of_study=nullif(btrim(coalesce(p_year_of_study,'')),''),
      interests=v_interests,
      updated_at=now()
  where user_id=v_user;
  if not found then raise exception 'Your campus community profile is not available.'; end if;
  return jsonb_build_object('saved',true);
end;
$function$;

create or replace function public.get_my_community_profile_details()
returns jsonb
language sql stable security definer set search_path to ''
as $function$
  select jsonb_build_object(
    'username',cp.username,'bio',cp.bio,'faculty',cp.faculty,
    'department',cp.department,'course_of_study',cp.course_of_study,
    'year_of_study',cp.year_of_study,'interests',cp.interests
  )
  from public.community_profiles cp
  where cp.user_id=(select auth.uid())
  limit 1;
$function$;

create or replace function public.list_my_campus_social_notifications(p_limit integer default 40)
returns table(
  notification_id uuid,kind text,actor_username text,target_type text,
  target_id uuid,excerpt text,created_at timestamptz,read_at timestamptz
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
begin
  if v_user is null or v_university is null then raise exception 'Sign in and select your university first.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to view social notifications.';
  end if;
  return query
    select n.id,n.kind,coalesce(cp.username,'campus member'),n.target_type,n.target_id,
      n.excerpt,n.created_at,n.read_at
    from public.campus_social_notifications n
    left join public.community_profiles cp on cp.user_id=n.actor_id
    where n.recipient_id=v_user and n.university_id=v_university
    order by n.created_at desc
    limit greatest(1,least(coalesce(p_limit,40),100));
end;
$function$;

create or replace function public.mark_campus_social_notification_read(p_notification_id uuid)
returns boolean
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
begin
  if v_user is null or v_university is null then raise exception 'Sign in and select your university first.'; end if;
  update public.campus_social_notifications
    set read_at=coalesce(read_at,now())
    where id=p_notification_id and recipient_id=v_user and university_id=v_university;
  return found;
end;
$function$;

revoke all on function private.create_campus_social_notification(uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
revoke all on function private.notify_campus_social_activity() from public,anon,authenticated;
revoke all on function public.update_my_community_profile_details(text,text,text,text,text,text[]) from public,anon;
revoke all on function public.get_my_community_profile_details() from public,anon;
revoke all on function public.list_my_campus_social_notifications(integer) from public,anon;
revoke all on function public.mark_campus_social_notification_read(uuid) from public,anon;
grant execute on function public.update_my_community_profile_details(text,text,text,text,text,text[]) to authenticated;
grant execute on function public.get_my_community_profile_details() to authenticated;
grant execute on function public.list_my_campus_social_notifications(integer) to authenticated;
grant execute on function public.mark_campus_social_notification_read(uuid) to authenticated;

commit;
