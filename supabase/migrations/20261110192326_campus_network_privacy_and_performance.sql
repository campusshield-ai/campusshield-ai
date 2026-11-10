-- Campus Network: make member blocks reciprocal across universities and index FK paths.
begin;

-- This helper is intentionally separate from same-campus messaging blocks:
-- Campus Network and Alumni Connect are cross-university surfaces, so either
-- side of a member block must hide the connection regardless of blocker's
-- currently selected university.
create or replace function private.is_campus_network_member_blocked(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then true
    else exists (
      select 1
      from public.campus_member_blocks b
      where
        (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other_user_id)
        or
        (b.blocker_id = p_other_user_id and b.blocked_id = (select auth.uid()))
    )
  end;
$function$;

revoke all on function private.is_campus_network_member_blocked(uuid)
  from public, anon, authenticated;

-- Keep the cross-university discovery/application checks symmetric.
create or replace function public.list_campus_network_posts(
  p_post_type text default null,
  p_scope text default 'campus',
  p_query text default null
) returns table(
  id uuid, post_type text, category text, title text, description text, skills text[],
  commitment text, visibility text, created_at timestamptz, expires_at timestamptz,
  is_mine boolean, creator_username text, university_name text, university_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to discover Campus Network posts.' using errcode='42501';
  end if;
  if p_scope not in ('campus','network') or (p_post_type is not null and p_post_type not in ('volunteer','startup')) then
    raise exception 'Choose a valid discovery filter.' using errcode='22023';
  end if;
  if char_length(v_query)>80 then raise exception 'Search text is too long.' using errcode='22023'; end if;
  return query
  select n.id,n.post_type,n.category,n.title,n.description,n.skills,n.commitment,n.visibility,
         n.created_at,n.expires_at,(n.user_id=v_user),coalesce(cp.username,'campus member'),
         u.name,u.state
  from public.campus_network_posts n
  join public.campus_universities u on u.id=n.university_id and u.is_active=true
  join public.profiles owner_profile on owner_profile.id=n.user_id and owner_profile.verification_status='verified'
  left join public.community_profiles cp on cp.user_id=n.user_id
  where n.status='published' and n.expires_at>now()
    and (p_post_type is null or n.post_type=p_post_type)
    and (
      (p_scope='campus' and n.university_id=v_university)
      or (p_scope='network' and n.visibility='network')
    )
    and exists (
      select 1 from public.campus_memberships cm
      where cm.user_id=n.user_id and cm.university_id=n.university_id
        and cm.membership_status='active' and cm.verification_status='verified'
    )
    and (
      owner_profile.role<>'student'
      or exists (select 1 from public.student_identity_verifications siv
                 where siv.user_id=n.user_id and siv.status='approved')
    )
    and not exists (
      select 1 from public.student_identity_verifications siv
      where siv.user_id=n.user_id and siv.confirmed_fraud=true
        and siv.fraud_lock_at is not null and now()>=siv.fraud_lock_at
    )
    and not private.is_campus_network_member_blocked(n.user_id)
    and (v_query='' or n.title ilike '%'||v_query||'%' or n.description ilike '%'||v_query||'%'
         or n.category ilike '%'||v_query||'%' or array_to_string(n.skills,' ') ilike '%'||v_query||'%')
  order by n.created_at desc
  limit 100;
end;
$function$;

create or replace function public.apply_to_campus_network_post(p_post_id uuid,p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_post public.campus_network_posts%rowtype;
  v_id uuid;
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to apply.' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_note,''))) not between 5 and 500 then
    raise exception 'Write a short introduction between 5 and 500 characters.' using errcode='22023';
  end if;
  select * into v_post from public.campus_network_posts
  where id=p_post_id and status='published' and expires_at>now();
  if not found then raise exception 'This Campus Network post is no longer available.' using errcode='P0002'; end if;
  if v_post.user_id=v_user then raise exception 'You cannot apply to your own post.' using errcode='22023'; end if;
  if v_post.visibility='campus' and v_post.university_id<>v_university then
    raise exception 'This post is limited to its own university.' using errcode='42501';
  end if;
  if private.is_campus_network_member_blocked(v_post.user_id) then
    raise exception 'This connection is unavailable.' using errcode='42501';
  end if;
  insert into public.campus_network_applications(post_id,university_id,applicant_id,note)
  values(v_post.id,v_post.university_id,v_user,btrim(p_note))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already applied to this post.' using errcode='23505';
end;
$function$;

create or replace function public.list_campus_alumni_directory(p_scope text default 'campus',p_query text default null)
returns table(
  username text,university_name text,university_state text,programme text,graduation_year integer,
  headline text,bio text,skills text[],visibility text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to search Alumni Connect.' using errcode='42501';
  end if;
  if p_scope not in ('campus','network') or char_length(v_query)>80 then
    raise exception 'Choose a valid alumni directory filter.' using errcode='22023';
  end if;
  return query
  select coalesce(cp.username,'alumni member'),u.name,u.state,a.programme,a.graduation_year,
         a.headline,a.bio,a.skills,a.visibility
  from public.campus_alumni_profiles a
  join public.campus_universities u on u.id=a.university_id and u.is_active=true
  join public.profiles p on p.id=a.user_id and p.verification_status='verified'
  left join public.community_profiles cp on cp.user_id=a.user_id
  where a.status='verified'
    and (
      (p_scope='campus' and a.university_id=v_university)
      or (p_scope='network' and a.visibility='network')
    )
    and exists(select 1 from public.campus_memberships cm
      where cm.user_id=a.user_id and cm.university_id=a.university_id
        and cm.membership_status='active' and cm.verification_status='verified')
    and not private.is_campus_network_member_blocked(a.user_id)
    and (v_query='' or a.headline ilike '%'||v_query||'%' or a.programme ilike '%'||v_query||'%'
         or a.bio ilike '%'||v_query||'%' or coalesce(cp.username,'') ilike '%'||v_query||'%'
         or array_to_string(a.skills,' ') ilike '%'||v_query||'%')
  order by a.graduation_year desc,u.name,cp.username
  limit 100;
end;
$function$;

create or replace function public.request_campus_alumni_intro(p_alumni_user_id uuid,p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_profile public.campus_alumni_profiles%rowtype;
  v_id uuid;
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_note,''))) not between 5 and 500 then
    raise exception 'Write a short introduction between 5 and 500 characters.' using errcode='22023';
  end if;
  select * into v_profile from public.campus_alumni_profiles
  where user_id=p_alumni_user_id and status='verified';
  if not found or (v_profile.university_id<>v_university and v_profile.visibility<>'network') then
    raise exception 'This alumni profile is not available in your network.' using errcode='42501';
  end if;
  if v_profile.user_id=v_user then raise exception 'You cannot request an introduction to yourself.' using errcode='22023'; end if;
  if private.is_campus_network_member_blocked(v_profile.user_id) then
    raise exception 'This connection is unavailable.' using errcode='42501';
  end if;
  insert into public.campus_alumni_intro_requests(alumni_user_id,alumni_university_id,requester_id,note)
  values(p_alumni_user_id,v_profile.university_id,v_user,btrim(p_note))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already requested an introduction to this alumnus.' using errcode='23505';
end;
$function$;

-- Cover the Campus Network / Alumni Connect foreign keys identified by
-- Supabase's performance advisor. These also support efficient cleanup when
-- member profiles or universities are deleted.
create index if not exists campus_member_blocks_reverse_pair_idx
  on public.campus_member_blocks(blocked_id, blocker_id);
create index if not exists campus_alumni_intro_requests_alumni_university_id_idx
  on public.campus_alumni_intro_requests(alumni_university_id);
create index if not exists campus_alumni_intro_requests_requester_id_idx
  on public.campus_alumni_intro_requests(requester_id);
create index if not exists campus_alumni_profiles_reviewed_by_idx
  on public.campus_alumni_profiles(reviewed_by);
create index if not exists campus_alumni_profiles_university_id_idx
  on public.campus_alumni_profiles(university_id);
create index if not exists campus_network_applications_applicant_id_idx
  on public.campus_network_applications(applicant_id);
create index if not exists campus_network_posts_reviewed_by_idx
  on public.campus_network_posts(reviewed_by);
create index if not exists campus_network_posts_user_id_idx
  on public.campus_network_posts(user_id);

commit;
