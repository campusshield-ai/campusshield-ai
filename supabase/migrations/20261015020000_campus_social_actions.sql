-- University-scoped social actions: campus posts, reactions, replies, polls, follows and bookmarks.
begin;

alter table public.community_posts drop constraint if exists community_posts_post_type_check;
alter table public.community_posts add constraint community_posts_post_type_check
  check (post_type in ('safety_issue','suggestion','announcement','campus_update','question','poll','lost_found','marketplace_share'));

alter table public.community_comments add column if not exists parent_comment_id uuid
  references public.community_comments(id) on delete cascade;
create index if not exists community_comments_parent_idx
  on public.community_comments(parent_comment_id,created_at);

create table if not exists public.campus_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,followed_id),
  constraint campus_follows_not_self check (follower_id <> followed_id)
);
create index if not exists campus_follows_followed_idx
  on public.campus_follows(university_id,followed_id,created_at desc);

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
create index if not exists community_poll_votes_option_idx on public.community_poll_votes(option_id);

alter table public.campus_follows enable row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_votes enable row level security;

drop policy if exists campus_follows_read_same_campus on public.campus_follows;
create policy campus_follows_read_same_campus on public.campus_follows for select to authenticated
  using (university_id = (select private.current_campus_university_id()));
drop policy if exists campus_follows_add_same_campus on public.campus_follows;
create policy campus_follows_add_same_campus on public.campus_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
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
    user_id = (select auth.uid())
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
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and exists (select 1 from public.community_posts p
      where p.id = post_id and p.university_id = community_poll_votes.university_id and p.post_type = 'poll' and p.status = 'published')
  );

revoke all on table public.campus_follows, public.community_poll_options, public.community_poll_votes from anon, authenticated;
grant select (follower_id,followed_id,created_at) on public.campus_follows to authenticated;
grant insert (follower_id,followed_id,university_id) on public.campus_follows to authenticated;
grant delete on public.campus_follows to authenticated;
grant select (id,post_id,university_id,option_text,position,created_at) on public.community_poll_options to authenticated;
grant insert (post_id,university_id,option_text,position) on public.community_poll_options to authenticated;
grant select (post_id,option_id,created_at) on public.community_poll_votes to authenticated;
grant insert (post_id,option_id,university_id,user_id) on public.community_poll_votes to authenticated;
grant update (option_id) on public.community_poll_votes to authenticated;
grant select (id,post_id,author_username,parent_comment_id,body,status,created_at,updated_at)
  on public.community_comments to authenticated;

create or replace function public.create_campus_social_post(
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
  if v_profile_status not in ('pending','verified') then raise exception 'This account cannot post.'; end if;
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

create or replace function public.create_community_poll(
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
  select count(*) into v_count from unnest(v_options) as x where x is not null;
  if v_count < 2 or v_count > 4 then raise exception 'A poll needs 2–4 answer options.'; end if;
  if (select count(distinct lower(x)) from unnest(v_options) as x where x is not null) <> v_count then
    raise exception 'Poll options must be unique.';
  end if;
  if exists(select 1 from unnest(v_options) as x where x is not null and char_length(x)>160) then
    raise exception 'Each poll option must be 160 characters or fewer.';
  end if;
  if p_location is not null and char_length(btrim(p_location))>120 then raise exception 'The location is too long.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet.'; end if;
  select p.verification_status::text into v_status from public.profiles p where p.id=v_user_id;
  if v_status not in ('pending','verified') then raise exception 'This account cannot create a poll.'; end if;
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

create or replace function public.create_community_reply(p_post_id uuid,p_parent_comment_id uuid,p_body text)
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
  if v_status not in ('pending','verified') then raise exception 'This account cannot reply.'; end if;
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

create or replace function public.toggle_community_reaction(p_post_id uuid,p_reaction_type text default 'like')
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_exists boolean;
  v_count bigint;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before reacting.'; end if;
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

create or replace function public.toggle_community_bookmark(p_post_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_exists boolean;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before bookmarking.'; end if;
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

drop function if exists public.get_community_post_social(uuid[]);
create function public.get_community_post_social(p_post_ids uuid[])
returns table(post_id uuid,reaction_count bigint,user_reaction text,is_bookmarked boolean,following_author boolean)
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
      exists(select 1 from public.campus_follows f where f.follower_id=v_user_id and f.followed_id=p.author_id and f.university_id=v_university_id)
    from public.community_posts p
    where p.id=any(coalesce(p_post_ids,array[]::uuid[]))
      and p.university_id=v_university_id and p.status='published';
end;
$function$;

create or replace function public.get_community_poll_data(p_post_id uuid)
returns table(option_id uuid,option_text text,position integer,vote_count bigint,my_vote boolean)
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

create or replace function public.vote_community_poll(p_post_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before voting.'; end if;
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

create or replace function public.repost_community_post(p_post_id uuid)
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

create or replace function public.toggle_campus_follow(p_followed_id uuid,p_follow boolean)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before following.'; end if;
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

create or replace function public.toggle_campus_follow_post_author(p_post_id uuid,p_follow boolean)
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

revoke all on function public.create_campus_social_post(text,text,text,text) from public,anon;
revoke all on function public.create_community_poll(text,text,text,text,text,text,text) from public,anon;
revoke all on function public.create_community_reply(uuid,uuid,text) from public,anon;
revoke all on function public.toggle_community_reaction(uuid,text) from public,anon;
revoke all on function public.toggle_community_bookmark(uuid) from public,anon;
revoke all on function public.get_community_post_social(uuid[]) from public,anon;
revoke all on function public.get_community_poll_data(uuid) from public,anon;
revoke all on function public.vote_community_poll(uuid,uuid) from public,anon;
revoke all on function public.repost_community_post(uuid) from public,anon;
revoke all on function public.toggle_campus_follow(uuid,boolean) from public,anon;
revoke all on function public.toggle_campus_follow_post_author(uuid,boolean) from public,anon;
grant execute on function public.create_campus_social_post(text,text,text,text) to authenticated;
grant execute on function public.create_community_poll(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_community_reply(uuid,uuid,text) to authenticated;
grant execute on function public.toggle_community_reaction(uuid,text) to authenticated;
grant execute on function public.toggle_community_bookmark(uuid) to authenticated;
grant execute on function public.get_community_post_social(uuid[]) to authenticated;
grant execute on function public.get_community_poll_data(uuid) to authenticated;
grant execute on function public.vote_community_poll(uuid,uuid) to authenticated;
grant execute on function public.repost_community_post(uuid) to authenticated;
grant execute on function public.toggle_campus_follow(uuid,boolean) to authenticated;
grant execute on function public.toggle_campus_follow_post_author(uuid,boolean) to authenticated;

commit;
