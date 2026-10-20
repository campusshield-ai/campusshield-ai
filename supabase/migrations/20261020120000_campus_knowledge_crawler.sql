-- CampusShield AI: official campus knowledge crawler (staging migration)
-- Only public, explicitly approved campus domains are crawled. No private campus records are ingested.

create table if not exists public.campus_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  base_url text not null,
  domain text not null,
  status text not null default 'approved' check (status in ('approved','paused')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  last_crawl_status text,
  unique (university_id, domain)
);

create table if not exists public.campus_knowledge_pages (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  source_id uuid not null references public.campus_knowledge_sources(id) on delete cascade,
  url text not null,
  title text not null default '',
  body_text text not null,
  content_hash text not null,
  status text not null default 'published' check (status in ('published','hidden')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_id, url),
  check (char_length(body_text) <= 40000)
);

create index if not exists campus_knowledge_pages_search_idx
  on public.campus_knowledge_pages using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_text,'')));
create index if not exists campus_knowledge_pages_campus_fetched_idx
  on public.campus_knowledge_pages (university_id, fetched_at desc);

alter table public.campus_knowledge_sources enable row level security;
alter table public.campus_knowledge_pages enable row level security;

revoke all on public.campus_knowledge_sources from anon, authenticated;
revoke all on public.campus_knowledge_pages from anon, authenticated;
grant select, insert, update on public.campus_knowledge_sources to authenticated;
grant select, insert, update on public.campus_knowledge_pages to authenticated;

drop policy if exists campus_knowledge_sources_same_campus_read on public.campus_knowledge_sources;
create policy campus_knowledge_sources_same_campus_read
on public.campus_knowledge_sources for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

drop policy if exists campus_knowledge_sources_admin_insert on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_insert
on public.campus_knowledge_sources for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and created_by = (select auth.uid())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

drop policy if exists campus_knowledge_sources_admin_update on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_update
on public.campus_knowledge_sources for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

drop policy if exists campus_knowledge_pages_same_campus_read on public.campus_knowledge_pages;
create policy campus_knowledge_pages_same_campus_read
on public.campus_knowledge_pages for select to authenticated
using (
  status = 'published'
  and university_id = (select private.current_campus_university_id())
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

drop policy if exists campus_knowledge_pages_admin_insert on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_insert
on public.campus_knowledge_pages for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

drop policy if exists campus_knowledge_pages_admin_update on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_update
on public.campus_knowledge_pages for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
);

comment on table public.campus_knowledge_sources is 'Admin-approved public official domains for ShieldMind retrieval; never stores private campus records.';
comment on table public.campus_knowledge_pages is 'Cleaned text from approved public official pages with source URL and retrieval time.';
