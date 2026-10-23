-- Keep private media RLS checks from requiring direct client SELECT access to community_posts.author_id.
-- The helpers return only a boolean and enforce the signed-in user's current-campus boundary.
begin;

create or replace function private.can_read_community_post_for_media(
  p_post_id text,
  p_university_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_university_id is not null
    and p_university_id = (select private.current_campus_university_id())
    and exists (
      select 1
      from public.community_posts p
      where p.id::text = p_post_id
        and p.university_id = p_university_id
        and (
          p.status = 'published'
          or p.author_id = (select auth.uid())
          or (select private.current_campus_role()) = any (array['admin','security','teacher'])
        )
    );
$function$;

create or replace function private.owns_community_post_for_media(
  p_post_id text,
  p_university_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_university_id is not null
    and (select auth.uid()) is not null
    and p_university_id = (select private.current_campus_university_id())
    and exists (
      select 1
      from public.community_posts p
      where p.id::text = p_post_id
        and p.author_id = (select auth.uid())
        and p.university_id = p_university_id
    );
$function$;

revoke all on function private.can_read_community_post_for_media(text, uuid) from public, anon;
revoke all on function private.owns_community_post_for_media(text, uuid) from public, anon;
grant execute on function private.can_read_community_post_for_media(text, uuid) to authenticated;
grant execute on function private.owns_community_post_for_media(text, uuid) to authenticated;

-- Metadata policies use the guarded helpers instead of querying community_posts as the caller.
drop policy if exists community_post_media_read_same_campus on public.community_post_media;
create policy community_post_media_read_same_campus on public.community_post_media
for select to authenticated using (
  university_id = (select private.current_campus_university_id())
  and private.can_read_community_post_for_media(post_id::text, university_id)
);

drop policy if exists community_post_media_insert_own_same_campus on public.community_post_media;
create policy community_post_media_insert_own_same_campus on public.community_post_media
for insert to authenticated with check (
  uploader_id = (select auth.uid())
  and private.current_campus_account_status() = any (array['pending','verified'])
  and university_id = (select private.current_campus_university_id())
  and object_path like university_id::text || '/' || post_id::text || '/%'
  and private.owns_community_post_for_media(post_id::text, university_id)
);

-- Storage policies call guarded helpers for ownership/readability checks. No direct author_id grant is needed.
drop policy if exists campus_media_read_same_campus on storage.objects;
create policy campus_media_read_same_campus on storage.objects
for select to authenticated using (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and exists (
    select 1
    from public.community_post_media m
    where m.object_path = name
      and m.university_id = (select private.current_campus_university_id())
      and private.can_read_community_post_for_media(m.post_id::text, m.university_id)
  )
);

drop policy if exists campus_media_upload_same_campus on storage.objects;
create policy campus_media_upload_same_campus on storage.objects
for insert to authenticated with check (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and private.current_campus_account_status() = any (array['pending','verified'])
  and private.owns_community_post_for_media(
    split_part(name,'/',2),
    (select private.current_campus_university_id())
  )
);

drop policy if exists campus_media_delete_own_same_campus on storage.objects;
create policy campus_media_delete_own_same_campus on storage.objects
for delete to authenticated using (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and private.owns_community_post_for_media(
    split_part(name,'/',2),
    (select private.current_campus_university_id())
  )
);

commit;
