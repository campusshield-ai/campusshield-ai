-- Campus Network Hub: volunteer calls, startup teams, verified alumni directory and opt-in cross-university discovery.
-- All public reads and writes are routed through security-definer RPCs. No direct table access is granted.
begin;

create table if not exists public.campus_network_posts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null check (post_type in ('volunteer','startup')),
  category text not null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 20 and 2200),
  skills text[] not null default '{}'::text[],
  commitment text check (commitment is null or char_length(btrim(commitment)) <= 120),
  visibility text not null default 'campus' check (visibility in ('campus','network')),
  status text not null default 'pending' check (status in ('pending','published','closed','rejected')),
  expires_at timestamptz not null default (now() + interval '45 days'),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_network_posts_category_check check (
    (post_type='volunteer' and category in ('community','education','environment','health','events','fundraising','digital_skills','other'))
    or
    (post_type='startup' and category in ('technology','education','health','commerce','social_impact','agriculture','creative','other'))
  )
);
create index if not exists campus_network_posts_discovery_idx
  on public.campus_network_posts(post_type, visibility, status, expires_at desc, created_at desc);
create index if not exists campus_network_posts_university_idx
  on public.campus_network_posts(university_id, post_type, status, created_at desc);

create table if not exists public.campus_network_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.campus_network_posts(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, applicant_id)
);
create index if not exists campus_network_applications_owner_idx
  on public.campus_network_applications(university_id, post_id, status, created_at desc);

create table if not exists public.campus_alumni_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  programme text not null check (char_length(btrim(programme)) between 2 and 140),
  graduation_year integer not null check (graduation_year between 1950 and 2100),
  headline text not null check (char_length(btrim(headline)) between 5 and 120),
  bio text not null check (char_length(btrim(bio)) between 30 and 1200),
  skills text[] not null default '{}'::text[],
  visibility text not null default 'campus' check (visibility in ('campus','network')),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campus_alumni_profiles_discovery_idx
  on public.campus_alumni_profiles(visibility, status, university_id, graduation_year desc);

create table if not exists public.campus_alumni_intro_requests (
  id uuid primary key default gen_random_uuid(),
  alumni_user_id uuid not null references public.profiles(id) on delete cascade,
  alumni_university_id uuid not null references public.campus_universities(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alumni_user_id <> requester_id),
  unique(alumni_user_id, requester_id)
);
create index if not exists campus_alumni_intro_requests_inbox_idx
  on public.campus_alumni_intro_requests(alumni_user_id, status, created_at desc);

alter table public.campus_network_posts enable row level security;
alter table public.campus_network_applications enable row level security;
alter table public.campus_alumni_profiles enable row level security;
alter table public.campus_alumni_intro_requests enable row level security;

drop policy if exists campus_network_posts_rpc_only on public.campus_network_posts;
create policy campus_network_posts_rpc_only on public.campus_network_posts
  for all to authenticated using (false) with check (false);
drop policy if exists campus_network_applications_rpc_only on public.campus_network_applications;
create policy campus_network_applications_rpc_only on public.campus_network_applications
  for all to authenticated using (false) with check (false);
drop policy if exists campus_alumni_profiles_rpc_only on public.campus_alumni_profiles;
create policy campus_alumni_profiles_rpc_only on public.campus_alumni_profiles
  for all to authenticated using (false) with check (false);
drop policy if exists campus_alumni_intro_requests_rpc_only on public.campus_alumni_intro_requests;
create policy campus_alumni_intro_requests_rpc_only on public.campus_alumni_intro_requests
  for all to authenticated using (false) with check (false);

revoke all on table public.campus_network_posts, public.campus_network_applications,
  public.campus_alumni_profiles, public.campus_alumni_intro_requests from anon, authenticated;

create or replace function public.create_campus_network_post(
  p_post_type text, p_category text, p_title text, p_description text,
  p_skills text[] default '{}'::text[], p_commitment text default null,
  p_visibility text default 'campus'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_id uuid;
  v_skills text[];
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to use Campus Network.' using errcode='42501';
  end if;
  if p_post_type not in ('volunteer','startup') or p_visibility not in ('campus','network') then
    raise exception 'Choose a valid Campus Network type and visibility.' using errcode='22023';
  end if;
  if p_post_type='volunteer' and p_category not in ('community','education','environment','health','events','fundraising','digital_skills','other') then
    raise exception 'Choose a valid volunteer category.' using errcode='22023';
  end if;
  if p_post_type='startup' and p_category not in ('technology','education','health','commerce','social_impact','agriculture','creative','other') then
    raise exception 'Choose a valid Startup Corner category.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 120
     or char_length(btrim(coalesce(p_description,''))) not between 20 and 2200
     or char_length(btrim(coalesce(p_commitment,''))) > 120 then
    raise exception 'Check the title, description and time commitment.' using errcode='22023';
  end if;
  select coalesce(array_agg(left(btrim(clean.skill),40)), '{}'::text[]) into v_skills
  from (
    select distinct skill
    from pg_catalog.unnest(coalesce(p_skills,'{}'::text[])) as input(skill)
    where char_length(btrim(skill)) between 1 and 40
    limit 12
  ) clean;
  insert into public.campus_network_posts(
    university_id,user_id,post_type,category,title,description,skills,commitment,visibility
  ) values (
    v_university,v_user,p_post_type,p_category,btrim(p_title),btrim(p_description),
    coalesce(v_skills,'{}'::text[]),nullif(btrim(coalesce(p_commitment,'')),''),p_visibility
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_campus_network_posts(
  p_post_type text default null, p_scope text default 'campus', p_query text default null
) returns table(
  id uuid, post_type text, category text, title text, description text, skills text[],
  commitment text, visibility text, created_at timestamptz, expires_at timestamptz,
  is_mine boolean, creator_username text, university_name text, university_state text
)
language plpgsql stable security definer set search_path = ''
as $$
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
    and (n.university_id<>v_university or not private.is_campus_member_blocked(n.user_id,v_university))
    and (v_query='' or n.title ilike '%'||v_query||'%' or n.description ilike '%'||v_query||'%'
         or n.category ilike '%'||v_query||'%' or array_to_string(n.skills,' ') ilike '%'||v_query||'%')
  order by n.created_at desc
  limit 100;
end;
$$;

create or replace function public.apply_to_campus_network_post(p_post_id uuid,p_note text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  if v_post.university_id=v_university
     and private.is_campus_member_blocked(v_post.user_id,v_university) then
    raise exception 'This connection is unavailable.' using errcode='42501';
  end if;
  insert into public.campus_network_applications(post_id,university_id,applicant_id,note)
  values(v_post.id,v_post.university_id,v_user,btrim(p_note))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already applied to this post.' using errcode='23505';
end;
$$;

create or replace function public.list_my_campus_network_applications()
returns table(id uuid,post_id uuid,post_title text,post_type text,creator_username text,note text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  return query
  select a.id,a.post_id,n.title,n.post_type,coalesce(cp.username,'campus member'),
         a.note,a.status,a.created_at
  from public.campus_network_applications a
  join public.campus_network_posts n on n.id=a.post_id
  left join public.community_profiles cp on cp.user_id=n.user_id
  where a.applicant_id=v_user
  order by a.created_at desc limit 100;
end;
$$;

create or replace function public.list_campus_network_post_applications(p_post_id uuid)
returns table(id uuid,applicant_username text,note text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  if not exists(select 1 from public.campus_network_posts n
    where n.id=p_post_id and n.user_id=v_user and n.university_id=(select private.current_campus_university_id())) then
    raise exception 'Only the post owner can review its applications.' using errcode='42501';
  end if;
  return query
  select a.id,coalesce(cp.username,'campus member'),a.note,a.status,a.created_at
  from public.campus_network_applications a
  left join public.community_profiles cp on cp.user_id=a.applicant_id
  where a.post_id=p_post_id order by a.created_at desc limit 100;
end;
$$;

create or replace function public.respond_to_campus_network_application(p_application_id uuid,p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  if p_decision not in ('accepted','declined') then raise exception 'Choose accepted or declined.' using errcode='22023'; end if;
  update public.campus_network_applications a
    set status=p_decision,updated_at=now()
  from public.campus_network_posts n
  where a.post_id=n.id and a.id=p_application_id and n.user_id=(select auth.uid())
    and n.university_id=(select private.current_campus_university_id()) and a.status='pending';
  if not found then raise exception 'This application is not available for your post.' using errcode='42501'; end if;
end;
$$;

create or replace function public.close_my_campus_network_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  update public.campus_network_posts set status='closed',updated_at=now()
  where id=p_post_id and user_id=(select auth.uid())
    and university_id=(select private.current_campus_university_id())
    and status in ('published','pending');
  if not found then raise exception 'Only your active post can be closed.' using errcode='42501'; end if;
end;
$$;

create or replace function public.review_campus_network_post(p_post_id uuid,p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_role text := (select private.current_campus_role());
begin
  if (select auth.uid()) is null or coalesce(v_role,'') not in ('admin','security','teacher')
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus staff access is required.' using errcode='42501';
  end if;
  if p_decision not in ('publish','reject') then raise exception 'Choose publish or reject.' using errcode='22023'; end if;
  update public.campus_network_posts set
    status=case when p_decision='publish' then 'published' else 'rejected' end,
    reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now()
  where id=p_post_id and university_id=(select private.current_campus_university_id()) and status='pending';
  if not found then raise exception 'This post is not awaiting review in your university.' using errcode='42501'; end if;
end;
$$;

create or replace function public.submit_campus_alumni_profile(
  p_programme text,p_graduation_year integer,p_headline text,p_bio text,
  p_skills text[] default '{}'::text[],p_visibility text default 'campus'
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_university uuid := (select private.current_campus_university_id());
  v_skills text[];
begin
  if v_user is null or v_university is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required to request Alumni Connect.' using errcode='42501';
  end if;
  if p_visibility not in ('campus','network')
     or char_length(btrim(coalesce(p_programme,''))) not between 2 and 140
     or p_graduation_year<1950 or p_graduation_year>extract(year from now())::integer
     or char_length(btrim(coalesce(p_headline,''))) not between 5 and 120
     or char_length(btrim(coalesce(p_bio,''))) not between 30 and 1200 then
    raise exception 'Check your programme, graduation year, headline and biography.' using errcode='22023';
  end if;
  select coalesce(array_agg(left(btrim(clean.skill),40)), '{}'::text[]) into v_skills
  from (
    select distinct skill
    from pg_catalog.unnest(coalesce(p_skills,'{}'::text[])) as input(skill)
    where char_length(btrim(skill)) between 1 and 40
    limit 12
  ) clean;
  insert into public.campus_alumni_profiles(
    user_id,university_id,programme,graduation_year,headline,bio,skills,visibility,status,reviewed_by,reviewed_at,review_note
  ) values (
    v_user,v_university,btrim(p_programme),p_graduation_year,btrim(p_headline),btrim(p_bio),
    coalesce(v_skills,'{}'::text[]),p_visibility,'pending',null,null,null
  )
  on conflict(user_id) do update set
    university_id=excluded.university_id,programme=excluded.programme,graduation_year=excluded.graduation_year,
    headline=excluded.headline,bio=excluded.bio,skills=excluded.skills,visibility=excluded.visibility,
    status='pending',reviewed_by=null,reviewed_at=null,review_note=null,updated_at=now();
  return 'pending';
end;
$$;

create or replace function public.list_campus_alumni_directory(p_scope text default 'campus',p_query text default null)
returns table(
  username text,university_name text,university_state text,programme text,graduation_year integer,
  headline text,bio text,skills text[],visibility text
)
language plpgsql stable security definer set search_path = ''
as $$
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
    and (v_query='' or a.headline ilike '%'||v_query||'%' or a.programme ilike '%'||v_query||'%'
         or a.bio ilike '%'||v_query||'%' or coalesce(cp.username,'') ilike '%'||v_query||'%'
         or array_to_string(a.skills,' ') ilike '%'||v_query||'%')
  order by a.graduation_year desc,u.name,cp.username
  limit 100;
end;
$$;

create or replace function public.list_campus_alumni_review_queue()
returns table(user_id uuid,username text,programme text,graduation_year integer,headline text,bio text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher')
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus staff access is required.' using errcode='42501';
  end if;
  return query
  select a.user_id,coalesce(cp.username,'member'),a.programme,a.graduation_year,a.headline,a.bio,a.created_at
  from public.campus_alumni_profiles a
  left join public.community_profiles cp on cp.user_id=a.user_id
  where a.university_id=(select private.current_campus_university_id()) and a.status='pending'
  order by a.created_at asc limit 50;
end;
$$;

create or replace function public.review_campus_alumni_profile(p_user_id uuid,p_decision text,p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or coalesce((select private.current_campus_role()),'') not in ('admin','security','teacher')
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus staff access is required.' using errcode='42501';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject.' using errcode='22023'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_note,'')))<3 then
    raise exception 'Add a short note when rejecting an alumni request.' using errcode='22023';
  end if;
  update public.campus_alumni_profiles
  set status=case when p_decision='verify' then 'verified' else 'rejected' end,
      reviewed_by=(select auth.uid()),reviewed_at=now(),review_note=case when p_decision='reject' then left(btrim(p_note),500) else null end,
      updated_at=now()
  where user_id=p_user_id and university_id=(select private.current_campus_university_id()) and status='pending';
  if not found then raise exception 'This alumni request is not awaiting review in your university.' using errcode='42501'; end if;
end;
$$;

create or replace function public.request_campus_alumni_intro(p_alumni_user_id uuid,p_note text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
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
  if v_profile.university_id=v_university and private.is_campus_member_blocked(v_profile.user_id,v_university) then
    raise exception 'This connection is unavailable.' using errcode='42501';
  end if;
  insert into public.campus_alumni_intro_requests(alumni_user_id,alumni_university_id,requester_id,note)
  values(p_alumni_user_id,v_profile.university_id,v_user,btrim(p_note))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already requested an introduction to this alumnus.' using errcode='23505';
end;
$$;

create or replace function public.request_campus_alumni_intro_by_username(p_username text,p_note text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_alumni_user uuid; v_request uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to request an alumni introduction.' using errcode='42501';
  end if;
  if p_username is null or char_length(btrim(p_username)) not between 3 and 20 then
    raise exception 'Choose a valid alumni username.' using errcode='22023';
  end if;
  select a.user_id into v_alumni_user
  from public.campus_alumni_profiles a
  join public.community_profiles cp on cp.user_id=a.user_id
  where lower(cp.username)=lower(btrim(p_username)) and a.status='verified'
  limit 1;
  if v_alumni_user is null then
    raise exception 'This verified alumni profile is no longer available.' using errcode='P0002';
  end if;
  v_request := public.request_campus_alumni_intro(v_alumni_user,p_note);
  return v_request;
end;
$$;

create or replace function public.list_my_campus_alumni_intro_requests()
returns table(id uuid,username text,university_name text,note text,status text,direction text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  return query
  select r.id,coalesce(cp.username,'campus member'),u.name,r.note,r.status,
         case when r.alumni_user_id=v_user then 'received' else 'sent' end,r.created_at
  from public.campus_alumni_intro_requests r
  join public.campus_universities u on u.id=r.alumni_university_id
  left join public.community_profiles cp on cp.user_id=case when r.alumni_user_id=v_user then r.requester_id else r.alumni_user_id end
  where r.alumni_user_id=v_user or r.requester_id=v_user
  order by r.created_at desc limit 100;
end;
$$;

create or replace function public.respond_to_campus_alumni_intro(p_request_id uuid,p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus membership is required.' using errcode='42501';
  end if;
  if p_decision not in ('accepted','declined') then raise exception 'Choose accepted or declined.' using errcode='22023'; end if;
  update public.campus_alumni_intro_requests set status=p_decision,updated_at=now()
  where id=p_request_id and alumni_user_id=(select auth.uid()) and status='pending';
  if not found then raise exception 'This introduction request is not waiting for you.' using errcode='42501'; end if;
end;
$$;

-- No anonymous or direct authenticated table access. Only the narrowly scoped RPCs below are exposed.
revoke all on function public.create_campus_network_post(text,text,text,text,text[],text,text) from public,anon,authenticated;
revoke all on function public.list_campus_network_posts(text,text,text) from public,anon,authenticated;
revoke all on function public.apply_to_campus_network_post(uuid,text) from public,anon,authenticated;
revoke all on function public.list_my_campus_network_applications() from public,anon,authenticated;
revoke all on function public.list_campus_network_post_applications(uuid) from public,anon,authenticated;
revoke all on function public.respond_to_campus_network_application(uuid,text) from public,anon,authenticated;
revoke all on function public.close_my_campus_network_post(uuid) from public,anon,authenticated;
revoke all on function public.review_campus_network_post(uuid,text) from public,anon,authenticated;
revoke all on function public.submit_campus_alumni_profile(text,integer,text,text,text[],text) from public,anon,authenticated;
revoke all on function public.list_campus_alumni_directory(text,text) from public,anon,authenticated;
revoke all on function public.list_campus_alumni_review_queue() from public,anon,authenticated;
revoke all on function public.review_campus_alumni_profile(uuid,text,text) from public,anon,authenticated;
revoke all on function public.request_campus_alumni_intro(uuid,text) from public,anon,authenticated;
revoke all on function public.request_campus_alumni_intro_by_username(text,text) from public,anon,authenticated;
revoke all on function public.list_my_campus_alumni_intro_requests() from public,anon,authenticated;
revoke all on function public.respond_to_campus_alumni_intro(uuid,text) from public,anon,authenticated;

grant execute on function public.create_campus_network_post(text,text,text,text,text[],text,text) to authenticated;
grant execute on function public.list_campus_network_posts(text,text,text) to authenticated;
grant execute on function public.apply_to_campus_network_post(uuid,text) to authenticated;
grant execute on function public.list_my_campus_network_applications() to authenticated;
grant execute on function public.list_campus_network_post_applications(uuid) to authenticated;
grant execute on function public.respond_to_campus_network_application(uuid,text) to authenticated;
grant execute on function public.close_my_campus_network_post(uuid) to authenticated;
grant execute on function public.review_campus_network_post(uuid,text) to authenticated;
grant execute on function public.submit_campus_alumni_profile(text,integer,text,text,text[],text) to authenticated;
grant execute on function public.list_campus_alumni_directory(text,text) to authenticated;
grant execute on function public.list_campus_alumni_review_queue() to authenticated;
grant execute on function public.review_campus_alumni_profile(uuid,text,text) to authenticated;
grant execute on function public.request_campus_alumni_intro(uuid,text) to authenticated;
grant execute on function public.request_campus_alumni_intro_by_username(text,text) to authenticated;
grant execute on function public.list_my_campus_alumni_intro_requests() to authenticated;
grant execute on function public.respond_to_campus_alumni_intro(uuid,text) to authenticated;

commit;