-- Prevent pending campus accounts from using privileged social RPCs to bypass verified-only interactions.
begin;

create or replace function public.toggle_community_reaction(p_post_id uuid, p_reaction_type text default 'like'::text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id()); v_exists boolean; v_count bigint;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before reacting.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before reacting.'; end if;
  if p_reaction_type not in ('like','support','celebrate','helpful') then raise exception 'Choose a valid reaction.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then raise exception 'This post is not available in your university community.'; end if;
  select exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id) into v_exists;
  if v_exists then
    if exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id and r.reaction_type=p_reaction_type) then delete from public.community_post_reactions where post_id=p_post_id and user_id=v_user_id;
    else update public.community_post_reactions set reaction_type=p_reaction_type where post_id=p_post_id and user_id=v_user_id; end if;
  else insert into public.community_post_reactions(post_id,user_id,reaction_type) values(p_post_id,v_user_id,p_reaction_type); end if;
  select count(*) into v_count from public.community_post_reactions r where r.post_id=p_post_id;
  return jsonb_build_object('reacted',exists(select 1 from public.community_post_reactions r where r.post_id=p_post_id and r.user_id=v_user_id),'count',v_count);
end; $function$;

create or replace function public.toggle_community_bookmark(p_post_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id()); v_exists boolean;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before bookmarking.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before bookmarking posts.'; end if;
  if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then raise exception 'This post is not available in your university community.'; end if;
  select exists(select 1 from public.community_post_bookmarks b where b.post_id=p_post_id and b.user_id=v_user_id) into v_exists;
  if v_exists then delete from public.community_post_bookmarks where post_id=p_post_id and user_id=v_user_id; return false; end if;
  insert into public.community_post_bookmarks(post_id,user_id) values(p_post_id,v_user_id); return true;
end; $function$;

create or replace function public.vote_community_poll(p_post_id uuid, p_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before voting.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before voting in polls.'; end if;
  if not exists(select 1 from public.community_posts p join public.community_poll_options o on o.post_id=p.id where p.id=p_post_id and o.id=p_option_id and p.post_type='poll' and p.status='published' and p.university_id=v_university_id and o.university_id=v_university_id) then raise exception 'This poll is not available in your university community.'; end if;
  insert into public.community_poll_votes(post_id,option_id,university_id,user_id) values(p_post_id,p_option_id,v_university_id,v_user_id) on conflict(post_id,user_id) do update set option_id=excluded.option_id,university_id=excluded.university_id,created_at=now();
end; $function$;

create or replace function public.repost_community_post(p_post_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id()); v_username text; v_source public.community_posts%rowtype; v_new_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before reposting.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before reposting content.'; end if;
  select * into v_source from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published';
  if not found then raise exception 'This post is not available in your university community.'; end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet. Refresh and try again.'; end if;
  insert into public.community_posts(university_id,author_id,author_username,post_type,title,body,location,status,is_official,reposted_from_id) values(v_university_id,v_user_id,v_username,'campus_update','Repost: '||left(v_source.title,90),left('Shared by @'||v_source.author_username||E'\n\n'||v_source.body,2000),null,'pending',false,p_post_id) returning id into v_new_id;
  return v_new_id;
end; $function$;

create or replace function public.toggle_campus_follow(p_followed_id uuid, p_follow boolean)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before following.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before following campus members.'; end if;
  if p_followed_id=v_user_id then raise exception 'You cannot follow your own profile.'; end if;
  if not exists(select 1 from public.campus_memberships cm where cm.user_id=p_followed_id and cm.university_id=v_university_id and cm.membership_status='active') then raise exception 'You can only follow students from your own university.'; end if;
  if p_follow then insert into public.campus_follows(follower_id,followed_id,university_id) values(v_user_id,p_followed_id,v_university_id) on conflict(follower_id,followed_id) do nothing; return true;
  else delete from public.campus_follows where follower_id=v_user_id and followed_id=p_followed_id and university_id=v_university_id; return false; end if;
end; $function$;

create or replace function public.toggle_campus_follow_post_author(p_post_id uuid, p_follow boolean)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := (select auth.uid()); v_university_id uuid := (select private.current_campus_university_id()); v_author_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before following.'; end if;
  if private.current_campus_account_status() is distinct from 'verified' or coalesce((select private.current_campus_role()), '') = '' then raise exception 'Verify your campus account before following campus members.'; end if;
  select p.author_id into v_author_id from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published';
  if not found then raise exception 'This post is not available in your university community.'; end if;
  if v_author_id=v_user_id then raise exception 'You cannot follow your own profile.'; end if;
  if p_follow then insert into public.campus_follows(follower_id,followed_id,university_id) values(v_user_id,v_author_id,v_university_id) on conflict(follower_id,followed_id) do nothing; return true;
  else delete from public.campus_follows where follower_id=v_user_id and followed_id=v_author_id and university_id=v_university_id; return false; end if;
end; $function$;

revoke all on function public.toggle_community_reaction(uuid,text) from public, anon;
grant execute on function public.toggle_community_reaction(uuid,text) to authenticated;
revoke all on function public.toggle_community_bookmark(uuid) from public, anon;
grant execute on function public.toggle_community_bookmark(uuid) to authenticated;
revoke all on function public.vote_community_poll(uuid,uuid) from public, anon;
grant execute on function public.vote_community_poll(uuid,uuid) to authenticated;
revoke all on function public.repost_community_post(uuid) from public, anon;
grant execute on function public.repost_community_post(uuid) to authenticated;
revoke all on function public.toggle_campus_follow(uuid,boolean) from public, anon;
grant execute on function public.toggle_campus_follow(uuid,boolean) to authenticated;
revoke all on function public.toggle_campus_follow_post_author(uuid,boolean) from public, anon;
grant execute on function public.toggle_campus_follow_post_author(uuid,boolean) to authenticated;

commit;
