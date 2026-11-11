-- PRODUCTION CANDIDATE ONLY: CampusPulse Phase 2 social extensions.
-- This includes a minimal private member-block dependency only because Phase 2 RLS calls it.
-- Phase 3 profile/notification UI and RPCs are excluded.
begin;
do $preflight$
declare v_target text; v_existing text[]:=array[]::text[];
begin
  if to_regclass('public.profiles') is null or to_regclass('public.campus_universities') is null
     or to_regclass('public.campus_memberships') is null or to_regclass('public.community_profiles') is null
     or to_regclass('public.campus_events') is null then
    raise exception 'Required CampusPulse base tables are missing.';
  end if;
  if to_regprocedure('private.current_campus_university_id()') is null
     or to_regprocedure('private.current_campus_role()') is null
     or to_regprocedure('private.current_user_has_verified_campus_access()') is null then
    raise exception 'Required existing Production role helpers are missing.';
  end if;
  if to_regclass('public.campus_member_blocks') is null then
    raise exception 'The Production Campus Network member-block table is required by CampusPulse Phase 2.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_member_blocks' and column_name='blocker_id' and data_type='uuid')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_member_blocks' and column_name='blocked_id' and data_type='uuid')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='campus_member_blocks' and column_name='university_id' and data_type='uuid') then
    raise exception 'Production campus_member_blocks columns do not match the CampusPulse dependency contract.';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.campus_member_blocks'::regclass) then
    raise exception 'Production campus_member_blocks must have RLS enabled.';
  end if;
  if has_table_privilege('anon','public.campus_member_blocks','SELECT')
     or has_table_privilege('authenticated','public.campus_member_blocks','SELECT') then
    raise exception 'Production campus_member_blocks must not allow direct browser reads.';
  end if;
  foreach v_target in array array[
    'campus_collab_listings','campus_event_buddy_listings',
    'campus_mentorship_profiles','campus_memories','campus_peer_connection_requests',
    'campus_social_feature_reports'
  ] loop
    if to_regclass('public.'||v_target) is not null then v_existing:=array_append(v_existing,v_target); end if;
  end loop;
  if cardinality(v_existing)>0 then raise exception 'CampusPulse target tables already exist; schema diff required: %',array_to_string(v_existing,', '); end if;
end
$preflight$;

-- Reuse the Production Campus Network member-block table validated above.
-- Do not recreate its table, constraints or indexes in this phase.
alter table public.campus_member_blocks enable row level security;
revoke all on public.campus_member_blocks from public,anon,authenticated;
drop policy if exists campus_member_blocks_deny_direct_access on public.campus_member_blocks;
create policy campus_member_blocks_deny_direct_access
  on public.campus_member_blocks as restrictive
  for all to anon,authenticated using (false) with check (false);

create or replace function private.is_campus_member_blocked(
  p_other_user_id uuid,
  p_university_id uuid
) returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when (select auth.uid()) is null then true
    else exists (
      select 1
      from public.campus_member_blocks b
      where b.university_id = p_university_id
        and (
          (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other_user_id)
          or (b.blocker_id = p_other_user_id and b.blocked_id = (select auth.uid()))
        )
    )
  end;
$function$;
revoke all on function private.is_campus_member_blocked(uuid,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_campus_member_blocked(uuid,uuid) to authenticated;

-- Source migration: supabase/migrations/20261101173910_campuspulse_social_extensions_mvp.sql
-- CampusPulse social extension MVP
-- Applied to CampusShield AI Staging only as 20261101173910.
-- Missions, societies and events reuse existing CampusShield tables.
-- This migration creates only the additive social features that had no existing model.

create table public.campus_collab_listings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  category text not null check (category in ('study','project','hackathon','research','career','creative','other')),
  description text not null check (char_length(btrim(description)) between 10 and 1200),
  skills text[] not null default '{}',
  availability text,
  slots_available integer not null default 2 check (slots_available between 1 and 20),
  status text not null default 'open' check (status in ('open','closed')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campus_event_buddy_listings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  event_id uuid not null references public.campus_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  note text not null check (char_length(btrim(note)) between 5 and 500),
  extra_buddies integer not null default 1 check (extra_buddies between 1 and 10),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id,user_id)
);

create table public.campus_mentorship_profiles (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  mentor_type text not null default 'peer' check (mentor_type in ('peer','staff')),
  headline text not null check (char_length(btrim(headline)) between 5 and 120),
  bio text not null check (char_length(btrim(bio)) between 20 and 1000),
  topics text[] not null default '{}',
  availability text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.campus_memories (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  event_id uuid references public.campus_events(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  memory_text text not null check (char_length(btrim(memory_text)) between 20 and 1200),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campus_peer_connection_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  source_type text not null check (source_type in ('collab','event_buddy','mentorship')),
  source_id uuid not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_username text not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_username text not null,
  note text not null check (char_length(btrim(note)) between 5 and 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique (source_type,source_id,requester_id)
);

create table public.campus_social_feature_reports (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('collab','event_buddy','mentorship','memory')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','personal_information','misleading','other')),
  details text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id,target_type,target_id)
);

create index campus_collab_listings_campus_open_idx on public.campus_collab_listings(university_id,status,expires_at desc);
create index campus_event_buddy_listings_event_idx on public.campus_event_buddy_listings(university_id,event_id,status);
create index campus_mentorship_profiles_campus_active_idx on public.campus_mentorship_profiles(university_id,is_active);
create index campus_memories_campus_published_idx on public.campus_memories(university_id,status,created_at desc);
create index campus_peer_connections_recipient_idx on public.campus_peer_connection_requests(university_id,recipient_id,status,created_at desc);
create index campus_peer_connections_requester_idx on public.campus_peer_connection_requests(requester_id,status,created_at desc);
create index campus_social_reports_campus_status_idx on public.campus_social_feature_reports(university_id,status,created_at desc);

create or replace function private.prepare_campuspulse_social_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event_university uuid;
  v_event_status text;
  v_event_start timestamptz;
begin
  if auth.uid() is null or not private.current_user_has_verified_campus_access() then
    raise exception 'Verified campus membership is required.';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.university_id := private.current_campus_university_id();
    if new.university_id is null then raise exception 'Choose your university first.'; end if;
    select cp.username into new.creator_username from public.community_profiles cp where cp.user_id = auth.uid();
    if new.creator_username is null then raise exception 'Set up your CampusPulse username first.'; end if;
    new.created_at := now();
    if tg_table_name = 'campus_event_buddy_listings' then
      select e.university_id,e.status,e.starts_at into v_event_university,v_event_status,v_event_start
      from public.campus_events e where e.id = new.event_id;
      if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' or v_event_start <= now() then
        raise exception 'Choose an upcoming published event from your own university.';
      end if;
    elsif tg_table_name = 'campus_memories' then
      if new.event_id is not null then
        select e.university_id,e.status into v_event_university,v_event_status from public.campus_events e where e.id = new.event_id;
        if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' then
          raise exception 'A memory can only be linked to a published event at your university.';
        end if;
      end if;
      new.status := 'pending';
    elsif tg_table_name = 'campus_mentorship_profiles' then
      new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.university_id is distinct from old.university_id or new.creator_username is distinct from old.creator_username then
    raise exception 'CampusPulse ownership and campus cannot be changed.';
  end if;
  if tg_table_name = 'campus_mentorship_profiles' then
    new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
  elsif tg_table_name = 'campus_memories' and auth.uid() <> old.user_id then
    if new.title is distinct from old.title or new.memory_text is distinct from old.memory_text or new.event_id is distinct from old.event_id then
      raise exception 'Moderators may change memory review status, not rewrite a student memory.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campuspulse_social_item() from public,anon,authenticated;

create trigger campus_collab_prepare_item before insert or update on public.campus_collab_listings
for each row execute function private.prepare_campuspulse_social_item();
create trigger campus_event_buddy_prepare_item before insert or update on public.campus_event_buddy_listings
for each row execute function private.prepare_campuspulse_social_item();
create trigger campus_mentorship_prepare_item before insert or update on public.campus_mentorship_profiles
for each row execute function private.prepare_campuspulse_social_item();
create trigger campus_memories_prepare_item before insert or update on public.campus_memories
for each row execute function private.prepare_campuspulse_social_item();

create or replace function private.prepare_campus_peer_connection()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid;
  v_recipient_username text;
  v_username text;
  v_university uuid;
  v_open boolean := false;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.current_user_has_verified_campus_access() then raise exception 'Verified campus membership is required.'; end if;
    v_university := private.current_campus_university_id();
    select cp.username into v_username from public.community_profiles cp where cp.user_id = auth.uid();
    if v_university is null or v_username is null then raise exception 'Choose your university and set up your CampusPulse username first.'; end if;
    if new.source_type = 'collab' then
      select l.user_id,l.creator_username,(l.status = 'open' and l.expires_at > now())
      into v_recipient,v_recipient_username,v_open from public.campus_collab_listings l
      where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'event_buddy' then
      select l.user_id,l.creator_username,(l.status = 'open' and e.status = 'published' and e.starts_at > now())
      into v_recipient,v_recipient_username,v_open from public.campus_event_buddy_listings l
      join public.campus_events e on e.id = l.event_id
      where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'mentorship' then
      select l.user_id,l.creator_username,l.is_active into v_recipient,v_recipient_username,v_open
      from public.campus_mentorship_profiles l where l.id = new.source_id and l.university_id = v_university;
    end if;
    if v_recipient is null or not coalesce(v_open,false) then raise exception 'This CampusPulse opportunity is no longer available.'; end if;
    if v_recipient = auth.uid() then raise exception 'You cannot send a connection request to yourself.'; end if;
    new.requester_id := auth.uid();
    new.requester_username := v_username;
    new.recipient_id := v_recipient;
    new.recipient_username := v_recipient_username;
    new.university_id := v_university;
    new.status := 'pending';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.source_type is distinct from old.source_type or new.source_id is distinct from old.source_id
    or new.requester_id is distinct from old.requester_id or new.requester_username is distinct from old.requester_username
    or new.recipient_id is distinct from old.recipient_id or new.recipient_username is distinct from old.recipient_username
    or new.university_id is distinct from old.university_id or new.note is distinct from old.note or new.created_at is distinct from old.created_at then
    raise exception 'Connection request details cannot be rewritten.';
  end if;
  if old.status <> 'pending' then raise exception 'This connection request has already been handled.'; end if;
  if auth.uid() = old.recipient_id and new.status in ('accepted','declined') then null;
  elsif auth.uid() = old.requester_id and new.status = 'withdrawn' then null;
  else raise exception 'Only the recipient may accept or decline; the sender may withdraw.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campus_peer_connection() from public,anon,authenticated;

create or replace function private.prepare_campus_social_report()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_university uuid;
  v_exists boolean := false;
begin
  if tg_op = 'UPDATE' then
    if not (private.current_campus_role() in ('admin','security','teacher') and private.current_user_has_verified_campus_access()) then
      raise exception 'Only verified campus staff can update social reports.';
    end if;
    if new.id is distinct from old.id or new.university_id is distinct from old.university_id or new.reporter_id is distinct from old.reporter_id
      or new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id or new.reason is distinct from old.reason
      or new.details is distinct from old.details or new.created_at is distinct from old.created_at then
      raise exception 'Report details cannot be rewritten.';
    end if;
    return new;
  end if;
  if auth.uid() is null or not private.current_user_has_verified_campus_access() then raise exception 'Verified campus membership is required.'; end if;
  v_university := private.current_campus_university_id();
  if new.target_type = 'collab' then
    select true into v_exists from public.campus_collab_listings l where l.id = new.target_id and l.university_id = v_university and l.user_id <> auth.uid();
  elsif new.target_type = 'event_buddy' then
    select true into v_exists from public.campus_event_buddy_listings l where l.id = new.target_id and l.university_id = v_university and l.user_id <> auth.uid();
  elsif new.target_type = 'mentorship' then
    select true into v_exists from public.campus_mentorship_profiles l where l.id = new.target_id and l.university_id = v_university and l.user_id <> auth.uid();
  elsif new.target_type = 'memory' then
    select true into v_exists from public.campus_memories l where l.id = new.target_id and l.university_id = v_university and l.user_id <> auth.uid() and l.status = 'published';
  end if;
  if not coalesce(v_exists,false) then raise exception 'This campus content cannot be reported.'; end if;
  new.university_id := v_university;
  new.reporter_id := auth.uid();
  new.status := 'pending';
  return new;
end;
$$;
revoke all on function private.prepare_campus_social_report() from public,anon,authenticated;

create trigger campus_peer_connection_prepare before insert or update on public.campus_peer_connection_requests
for each row execute function private.prepare_campus_peer_connection();
create trigger campus_social_report_prepare before insert or update on public.campus_social_feature_reports
for each row execute function private.prepare_campus_social_report();

alter table public.campus_collab_listings enable row level security;
alter table public.campus_event_buddy_listings enable row level security;
alter table public.campus_mentorship_profiles enable row level security;
alter table public.campus_memories enable row level security;
alter table public.campus_peer_connection_requests enable row level security;
alter table public.campus_social_feature_reports enable row level security;

grant select,insert,update,delete on table public.campus_collab_listings,public.campus_event_buddy_listings,public.campus_mentorship_profiles,public.campus_memories to authenticated;
grant select,insert,update on table public.campus_peer_connection_requests,public.campus_social_feature_reports to authenticated;
revoke all on table public.campus_collab_listings,public.campus_event_buddy_listings,public.campus_mentorship_profiles,public.campus_memories,public.campus_peer_connection_requests,public.campus_social_feature_reports from anon;

create policy campus_collab_read_same_campus on public.campus_collab_listings for select to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and (status = 'open' or user_id = (select auth.uid())) and expires_at > now()
 and not private.is_campus_member_blocked(user_id,university_id));
create policy campus_collab_insert_own on public.campus_collab_listings for insert to authenticated with check (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and status = 'open' and private.current_user_has_verified_campus_access());
create policy campus_collab_update_own on public.campus_collab_listings for update to authenticated using (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access())
 with check (user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access());
create policy campus_collab_delete_own on public.campus_collab_listings for delete to authenticated using (
 user_id = (select auth.uid()) and private.current_user_has_verified_campus_access());

create policy campus_event_buddy_read_same_campus on public.campus_event_buddy_listings for select to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and status = 'open' and not private.is_campus_member_blocked(user_id,university_id)
 and exists(select 1 from public.campus_events e where e.id = campus_event_buddy_listings.event_id and e.university_id = campus_event_buddy_listings.university_id and e.status = 'published' and e.starts_at > now()));
create policy campus_event_buddy_insert_own on public.campus_event_buddy_listings for insert to authenticated with check (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and status = 'open' and private.current_user_has_verified_campus_access());
create policy campus_event_buddy_update_own on public.campus_event_buddy_listings for update to authenticated using (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access())
 with check (user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access());
create policy campus_event_buddy_delete_own on public.campus_event_buddy_listings for delete to authenticated using (
 user_id = (select auth.uid()) and private.current_user_has_verified_campus_access());

create policy campus_mentorship_read_active_same_campus on public.campus_mentorship_profiles for select to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and is_active and not private.is_campus_member_blocked(user_id,university_id));
create policy campus_mentorship_insert_own on public.campus_mentorship_profiles for insert to authenticated with check (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access());
create policy campus_mentorship_update_own on public.campus_mentorship_profiles for update to authenticated using (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id())
 with check (user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access());
create policy campus_mentorship_delete_own on public.campus_mentorship_profiles for delete to authenticated using (
 user_id = (select auth.uid()) and private.current_user_has_verified_campus_access());

create policy campus_memories_read_same_campus on public.campus_memories for select to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and (status = 'published' or user_id = (select auth.uid()) or private.current_campus_role() in ('admin','security','teacher'))
 and (user_id = (select auth.uid()) or not private.is_campus_member_blocked(user_id,university_id)));
create policy campus_memories_insert_own_pending on public.campus_memories for insert to authenticated with check (
 user_id = (select auth.uid()) and university_id = private.current_campus_university_id() and status = 'pending' and private.current_user_has_verified_campus_access());
create policy campus_memories_update_own_pending on public.campus_memories for update to authenticated using (
 user_id = (select auth.uid()) and status = 'pending' and university_id = private.current_campus_university_id())
 with check (user_id = (select auth.uid()) and status = 'pending' and university_id = private.current_campus_university_id() and private.current_user_has_verified_campus_access());
create policy campus_memories_staff_review on public.campus_memories for update to authenticated using (
 private.current_user_has_verified_campus_access() and private.current_campus_role() in ('admin','security','teacher') and university_id = private.current_campus_university_id())
 with check (private.current_user_has_verified_campus_access() and private.current_campus_role() in ('admin','security','teacher') and university_id = private.current_campus_university_id());
create policy campus_memories_delete_own_pending on public.campus_memories for delete to authenticated using (
 user_id = (select auth.uid()) and status = 'pending');

create policy campus_peer_connections_read_participants on public.campus_peer_connection_requests for select to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
 and not private.is_campus_member_blocked(requester_id,university_id) and not private.is_campus_member_blocked(recipient_id,university_id));
create policy campus_peer_connections_insert_requester on public.campus_peer_connection_requests for insert to authenticated with check (
 requester_id = (select auth.uid()) and university_id = private.current_campus_university_id() and status = 'pending' and private.current_user_has_verified_campus_access());
create policy campus_peer_connections_update_participants on public.campus_peer_connection_requests for update to authenticated using (
 private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid())))
 with check (private.current_user_has_verified_campus_access() and university_id = private.current_campus_university_id()
 and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid())));

create policy campus_social_reports_read_reporter on public.campus_social_feature_reports for select to authenticated using (
 reporter_id = (select auth.uid()) and university_id = private.current_campus_university_id());
create policy campus_social_reports_read_staff on public.campus_social_feature_reports for select to authenticated using (
 private.current_user_has_verified_campus_access() and private.current_campus_role() in ('admin','security','teacher') and university_id = private.current_campus_university_id());
create policy campus_social_reports_insert_own on public.campus_social_feature_reports for insert to authenticated with check (
 reporter_id = (select auth.uid()) and university_id = private.current_campus_university_id() and status = 'pending' and private.current_user_has_verified_campus_access());
create policy campus_social_reports_update_staff on public.campus_social_feature_reports for update to authenticated using (
 private.current_user_has_verified_campus_access() and private.current_campus_role() in ('admin','security','teacher') and university_id = private.current_campus_university_id())
 with check (private.current_user_has_verified_campus_access() and private.current_campus_role() in ('admin','security','teacher') and university_id = private.current_campus_university_id());


-- Source migration: supabase/migrations/20261101174446_campuspulse_event_link_update_guard.sql
-- Guard event links on edits too. Applied to Staging as 20261101174446.
create or replace function private.prepare_campuspulse_social_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event_university uuid;
  v_event_status text;
  v_event_start timestamptz;
begin
  if auth.uid() is null or not private.current_user_has_verified_campus_access() then
    raise exception 'Verified campus membership is required.';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.university_id := private.current_campus_university_id();
    if new.university_id is null then raise exception 'Choose your university first.'; end if;
    select cp.username into new.creator_username from public.community_profiles cp where cp.user_id = auth.uid();
    if new.creator_username is null then raise exception 'Set up your CampusPulse username first.'; end if;
    new.created_at := now();
    if tg_table_name = 'campus_event_buddy_listings' then
      select e.university_id,e.status,e.starts_at into v_event_university,v_event_status,v_event_start
      from public.campus_events e where e.id = new.event_id;
      if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' or v_event_start <= now() then
        raise exception 'Choose an upcoming published event from your own university.';
      end if;
    elsif tg_table_name = 'campus_memories' then
      if new.event_id is not null then
        select e.university_id,e.status into v_event_university,v_event_status from public.campus_events e where e.id = new.event_id;
        if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' then
          raise exception 'A memory can only be linked to a published event at your university.';
        end if;
      end if;
      new.status := 'pending';
    elsif tg_table_name = 'campus_mentorship_profiles' then
      new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.university_id is distinct from old.university_id or new.creator_username is distinct from old.creator_username then
    raise exception 'CampusPulse ownership and campus cannot be changed.';
  end if;
  if tg_table_name = 'campus_event_buddy_listings' and new.event_id is distinct from old.event_id then
    select e.university_id,e.status,e.starts_at into v_event_university,v_event_status,v_event_start
    from public.campus_events e where e.id = new.event_id;
    if v_event_university is distinct from old.university_id or v_event_status is distinct from 'published' or v_event_start <= now() then
      raise exception 'An event-buddy request must remain linked to an upcoming published event at your university.';
    end if;
  elsif tg_table_name = 'campus_memories' then
    if auth.uid() <> old.user_id and (new.title is distinct from old.title or new.memory_text is distinct from old.memory_text or new.event_id is distinct from old.event_id) then
      raise exception 'Moderators may change memory review status, not rewrite a student memory.';
    end if;
    if new.event_id is distinct from old.event_id and new.event_id is not null then
      select e.university_id,e.status into v_event_university,v_event_status from public.campus_events e where e.id = new.event_id;
      if v_event_university is distinct from old.university_id or v_event_status is distinct from 'published' then
        raise exception 'A memory can only be linked to a published event at your university.';
      end if;
    end if;
  elsif tg_table_name = 'campus_mentorship_profiles' then
    new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campuspulse_social_item() from public,anon,authenticated;

-- Source migration: supabase/migrations/20261101174607_campuspulse_peer_connections_respect_blocks.sql
-- Prevent connection requests to members blocked by the requester.
-- Applied to Staging as 20261101174607.
create or replace function private.prepare_campus_peer_connection()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid;
  v_recipient_username text;
  v_username text;
  v_university uuid;
  v_open boolean := false;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.current_user_has_verified_campus_access() then raise exception 'Verified campus membership is required.'; end if;
    v_university := private.current_campus_university_id();
    select cp.username into v_username from public.community_profiles cp where cp.user_id = auth.uid();
    if v_university is null or v_username is null then raise exception 'Choose your university and set up your CampusPulse username first.'; end if;
    if new.source_type = 'collab' then
      select l.user_id,l.creator_username,(l.status = 'open' and l.expires_at > now()) into v_recipient,v_recipient_username,v_open
      from public.campus_collab_listings l where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'event_buddy' then
      select l.user_id,l.creator_username,(l.status = 'open' and e.status = 'published' and e.starts_at > now()) into v_recipient,v_recipient_username,v_open
      from public.campus_event_buddy_listings l join public.campus_events e on e.id = l.event_id
      where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'mentorship' then
      select l.user_id,l.creator_username,l.is_active into v_recipient,v_recipient_username,v_open
      from public.campus_mentorship_profiles l where l.id = new.source_id and l.university_id = v_university;
    end if;
    if v_recipient is null or not coalesce(v_open,false) then raise exception 'This CampusPulse opportunity is no longer available.'; end if;
    if v_recipient = auth.uid() then raise exception 'You cannot send a connection request to yourself.'; end if;
    if private.is_campus_member_blocked(v_recipient,v_university) then
      raise exception 'A connection request cannot be sent because this connection is unavailable.';
    end if;
    new.requester_id := auth.uid();
    new.requester_username := v_username;
    new.recipient_id := v_recipient;
    new.recipient_username := v_recipient_username;
    new.university_id := v_university;
    new.status := 'pending';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.source_type is distinct from old.source_type or new.source_id is distinct from old.source_id
    or new.requester_id is distinct from old.requester_id or new.requester_username is distinct from old.requester_username
    or new.recipient_id is distinct from old.recipient_id or new.recipient_username is distinct from old.recipient_username
    or new.university_id is distinct from old.university_id or new.note is distinct from old.note or new.created_at is distinct from old.created_at then
    raise exception 'Connection request details cannot be rewritten.';
  end if;
  if old.status <> 'pending' then raise exception 'This connection request has already been handled.'; end if;
  if auth.uid() = old.recipient_id and new.status in ('accepted','declined') then null;
  elsif auth.uid() = old.requester_id and new.status = 'withdrawn' then null;
  else raise exception 'Only the recipient may accept or decline; the sender may withdraw.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campus_peer_connection() from public,anon,authenticated;

-- Source migration: supabase/migrations/20261101190831_campuspulse_social_privilege_hardening.sql
-- Harden privileges on the additive CampusPulse social tables.
-- Applied to CampusShield AI Staging only as version 20261101190831.
-- Keep RLS-protected row operations; remove unsafe default table-level privileges.
revoke all on table
  public.campus_collab_listings,
  public.campus_event_buddy_listings,
  public.campus_mentorship_profiles,
  public.campus_memories,
  public.campus_peer_connection_requests,
  public.campus_social_feature_reports
from anon, authenticated;

grant select, insert, update, delete on table
  public.campus_collab_listings,
  public.campus_event_buddy_listings,
  public.campus_mentorship_profiles,
  public.campus_memories
to authenticated;

grant select, insert, update on table
  public.campus_peer_connection_requests,
  public.campus_social_feature_reports
to authenticated;

-- service_role retains its existing server-side privileges.


commit;
