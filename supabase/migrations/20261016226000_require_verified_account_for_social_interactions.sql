-- Pending accounts may submit posts into moderation, but must not publish comments/replies
-- or join active groups until their campus account is verified.
begin;

create or replace function public.create_community_comment(p_post_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
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
  select p.verification_status::text into v_verification_status from public.profiles p where p.id=v_user_id;
  if v_verification_status is distinct from 'verified'
     or coalesce((select private.current_campus_role()), '') = '' then
    raise exception 'Verify your campus account before commenting.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 2 and 800 then raise exception 'Comments must be 2–800 characters.'; end if;
  if not exists (select 1 from public.community_posts p where p.id=p_post_id and p.status='published' and p.university_id=v_university_id) then
    raise exception 'This post is not available in your university community.';
  end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet. Refresh and try again.'; end if;
  insert into public.community_comments(post_id,author_id,author_username,body,status)
  values(p_post_id,v_user_id,v_username,btrim(p_body),'published') returning id into v_comment_id;
  return v_comment_id;
end;
$function$;

create or replace function public.create_community_reply(p_post_id uuid, p_parent_comment_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_status text;
  v_comment_id uuid;
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before replying.'; end if;
  select p.verification_status::text into v_status from public.profiles p where p.id=v_user_id;
  if v_status is distinct from 'verified'
     or coalesce((select private.current_campus_role()), '') = '' then
    raise exception 'Verify your campus account before replying.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 2 and 800 then raise exception 'Replies must be 2–800 characters.'; end if;
  if not exists (select 1 from public.community_posts p where p.id=p_post_id and p.university_id=v_university_id and p.status='published') then
    raise exception 'This post is not available in your university community.';
  end if;
  if not exists (select 1 from public.community_comments c where c.id=p_parent_comment_id and c.post_id=p_post_id and c.status='published') then
    raise exception 'The comment you are replying to is not available.';
  end if;
  select cp.username into v_username from public.community_profiles cp where cp.user_id=v_user_id;
  if v_username is null then raise exception 'Your public username is not ready yet. Refresh and try again.'; end if;
  insert into public.community_comments(post_id,author_id,author_username,parent_comment_id,body,status)
  values(p_post_id,v_user_id,v_username,p_parent_comment_id,btrim(p_body),'published') returning id into v_comment_id;
  return v_comment_id;
end;
$function$;

create or replace function public.join_campus_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then raise exception 'Sign in and choose a university before joining a group.'; end if;
  if private.current_campus_account_status() is distinct from 'verified'
     or coalesce((select private.current_campus_role()), '') = '' then
    raise exception 'Verify your campus account before joining groups.';
  end if;
  if not exists (select 1 from public.campus_groups g where g.id=p_group_id and g.university_id=v_university_id and g.status='active') then
    raise exception 'This group is not available in your university.';
  end if;
  insert into public.campus_group_members(group_id,user_id,member_role)
  values(p_group_id,v_user_id,'member') on conflict(group_id,user_id) do nothing;
end;
$function$;

revoke all on function public.create_community_comment(uuid,text) from public, anon;
grant execute on function public.create_community_comment(uuid,text) to authenticated;
revoke all on function public.create_community_reply(uuid,uuid,text) from public, anon;
grant execute on function public.create_community_reply(uuid,uuid,text) to authenticated;
revoke all on function public.join_campus_group(uuid) from public, anon;
grant execute on function public.join_campus_group(uuid) to authenticated;

commit;
