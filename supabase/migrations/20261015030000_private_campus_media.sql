-- Private campus media. Object paths are campus-id/post-id/file-name; bucket is not public.
begin;

create table if not exists public.community_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  media_kind text not null check (media_kind in ('image','video')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  alt_text text check (alt_text is null or char_length(btrim(alt_text)) <= 250),
  created_at timestamptz not null default now()
);
create index if not exists community_post_media_post_idx on public.community_post_media(post_id,created_at);

alter table public.community_post_media enable row level security;
drop policy if exists community_post_media_read_same_campus on public.community_post_media;
create policy community_post_media_read_same_campus on public.community_post_media
for select to authenticated using (
  university_id = (select private.current_campus_university_id())
  and exists (
    select 1 from public.community_posts p
    where p.id = community_post_media.post_id
      and p.university_id = community_post_media.university_id
      and (
        p.status = 'published'
        or p.author_id = (select auth.uid())
        or private.current_campus_role() = any (array['admin','security','teacher'])
      )
  )
);
drop policy if exists community_post_media_insert_own_same_campus on public.community_post_media;
create policy community_post_media_insert_own_same_campus on public.community_post_media
for insert to authenticated with check (
  uploader_id = (select auth.uid())
  and private.current_campus_account_status() = any (array['pending','verified'])
  and university_id = (select private.current_campus_university_id())
  and object_path like university_id::text || '/' || post_id::text || '/%'
  and exists (
    select 1 from public.community_posts p
    where p.id = community_post_media.post_id
      and p.author_id = (select auth.uid())
      and p.university_id = community_post_media.university_id
  )
);

revoke all on table public.community_post_media from anon, authenticated;
grant select (id,post_id,university_id,object_path,media_kind,mime_type,byte_size,alt_text,created_at)
  on public.community_post_media to authenticated;
grant insert (post_id,university_id,uploader_id,object_path,media_kind,mime_type,byte_size,alt_text)
  on public.community_post_media to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'campus-community-media','campus-community-media',false,52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];

drop policy if exists campus_media_read_same_campus on storage.objects;
create policy campus_media_read_same_campus on storage.objects
for select to authenticated using (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and exists (
    select 1
    from public.community_post_media m
    join public.community_posts p on p.id = m.post_id
    where m.object_path = storage.objects.name
      and m.university_id = (select private.current_campus_university_id())
      and (
        p.status = 'published'
        or p.author_id = (select auth.uid())
        or private.current_campus_role() = any (array['admin','security','teacher'])
      )
  )
);

drop policy if exists campus_media_upload_same_campus on storage.objects;
create policy campus_media_upload_same_campus on storage.objects
for insert to authenticated with check (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and private.current_campus_account_status() = any (array['pending','verified'])
  and exists (
    select 1 from public.community_posts p
    where p.id::text = split_part(name,'/',2)
      and p.author_id = (select auth.uid())
      and p.university_id = (select private.current_campus_university_id())
  )
);

drop policy if exists campus_media_delete_own_same_campus on storage.objects;
create policy campus_media_delete_own_same_campus on storage.objects
for delete to authenticated using (
  bucket_id = 'campus-community-media'
  and split_part(name,'/',1) = (select private.current_campus_university_id())::text
  and exists (
    select 1 from public.community_posts p
    where p.id::text = split_part(name,'/',2)
      and p.author_id = (select auth.uid())
      and p.university_id = (select private.current_campus_university_id())
  )
);

commit;
