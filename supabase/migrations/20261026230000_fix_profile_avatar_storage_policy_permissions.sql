-- Storage RLS policies for campus-community-media reference community_posts and
-- community_post_media. Granting SELECT lets those policy predicates evaluate.
-- Row-level security stays enabled and continues to limit visible rows by campus,
-- publication status, and ownership. No anonymous access or write grants are added.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'community_posts' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.community_posts before granting SELECT.';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'community_post_media' and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled on public.community_post_media before granting SELECT.';
  end if;
end $$;

grant select on public.community_posts, public.community_post_media to authenticated;

comment on table public.community_posts is
  'CampusPulse posts. Authenticated reads are constrained by RLS to verified same-campus access.';
comment on table public.community_post_media is
  'CampusPulse post media metadata. Authenticated reads are constrained by RLS to same-campus eligible posts.';
