-- Restore the saved-opportunity feature in Staging and enforce owner-only access.
-- The Production table existed already, but its generic verified-account policy
-- was broader than the user-owned bookmark rules. This migration narrows access.
begin;

create table if not exists public.campus_opportunity_bookmarks (
  opportunity_id uuid not null references public.campus_opportunities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

create index if not exists campus_opportunity_bookmarks_user_created_idx
  on public.campus_opportunity_bookmarks (user_id, created_at desc);
create index if not exists campus_opportunity_bookmarks_university_idx
  on public.campus_opportunity_bookmarks (university_id);

alter table public.campus_opportunity_bookmarks enable row level security;

drop policy if exists campus_opportunity_bookmarks_read_own
  on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_read_own
  on public.campus_opportunity_bookmarks
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and (select private.current_user_has_verified_campus_access())
  );

drop policy if exists campus_opportunity_bookmarks_insert_own
  on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_insert_own
  on public.campus_opportunity_bookmarks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and (select private.current_user_has_verified_campus_access())
    and exists (
      select 1
      from public.campus_opportunities o
      where o.id = campus_opportunity_bookmarks.opportunity_id
        and o.university_id = campus_opportunity_bookmarks.university_id
        and o.status = 'published'
        and (o.deadline is null or o.deadline > now())
    )
  );

drop policy if exists campus_opportunity_bookmarks_delete_own
  on public.campus_opportunity_bookmarks;
create policy campus_opportunity_bookmarks_delete_own
  on public.campus_opportunity_bookmarks
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and university_id = (select private.current_campus_university_id())
    and (select private.current_user_has_verified_campus_access())
  );

-- Keep trusted platform-owner support without granting all verified students
-- blanket access to other users' bookmarks.
drop policy if exists platform_owner_full_access
  on public.campus_opportunity_bookmarks;
create policy platform_owner_full_access
  on public.campus_opportunity_bookmarks
  for all to authenticated
  using ((select private.is_campusshield_owner_admin()))
  with check ((select private.is_campusshield_owner_admin()));

-- Remove the broad permissive policy if it exists. PostgreSQL ORs permissive
-- policies together, so a generic verified-account policy bypasses own-row rules.
drop policy if exists verified_account_required_for_interactions
  on public.campus_opportunity_bookmarks;

revoke all on table public.campus_opportunity_bookmarks from anon;
grant select, insert, delete on table public.campus_opportunity_bookmarks to authenticated;
grant all on table public.campus_opportunity_bookmarks to service_role;

commit;
