-- Prevent signed-in but unverified students from bypassing table RLS through
-- SECURITY DEFINER community-read RPCs. The UI may hide social screens, but these
-- public RPC endpoints must independently enforce the identity-approved gate.

begin;

create or replace function public.get_community_poll_data(p_post_id uuid)
returns table(
  option_id uuid,
  option_text text,
  "position" integer,
  vote_count bigint,
  my_vote boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then
    raise exception 'Sign in and choose a university.';
  end if;
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'Verify your student identity and wait for account approval before using campus interactions.';
  end if;
  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id
      and p.university_id = v_university_id
      and p.status = 'published'
      and p.post_type = 'poll'
  ) then
    raise exception 'This poll is not available in your university community.';
  end if;

  return query
    select o.id, o.option_text, o.position,
      (select count(*) from public.community_poll_votes v where v.option_id = o.id),
      exists (
        select 1 from public.community_poll_votes v
        where v.option_id = o.id and v.user_id = v_user_id
      )
    from public.community_poll_options o
    where o.post_id = p_post_id
      and o.university_id = v_university_id
    order by o.position;
end;
$function$;

create or replace function public.get_community_post_social(p_post_ids uuid[])
returns table(
  post_id uuid,
  reaction_count bigint,
  user_reaction text,
  is_bookmarked boolean,
  following_author boolean,
  is_my_post boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null then
    raise exception 'Sign in and choose a university.';
  end if;
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'Verify your student identity and wait for account approval before using campus interactions.';
  end if;
  if coalesce(cardinality(p_post_ids),0) > 50 then
    raise exception 'Load no more than 50 posts at a time.';
  end if;

  return query
    select p.id,
      (select count(*) from public.community_post_reactions r where r.post_id = p.id),
      (select r.reaction_type from public.community_post_reactions r where r.post_id = p.id and r.user_id = v_user_id),
      exists(select 1 from public.community_post_bookmarks b where b.post_id = p.id and b.user_id = v_user_id),
      exists(select 1 from public.campus_follows f where f.follower_id = v_user_id and f.followed_id = p.author_id and f.university_id = v_university_id),
      p.author_id = v_user_id
    from public.community_posts p
    where p.id = any(coalesce(p_post_ids, array[]::uuid[]))
      and p.university_id = v_university_id
      and p.status = 'published';
end;
$function$;

commit;
