-- Raise private profile avatar uploads to 20 MiB (20 * 1024 * 1024 bytes).
-- Keep the bucket private and preserve per-user object-level authorization.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campus-profile-avatars',
  'campus-profile-avatars',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'],
  updated_at = now();

drop policy if exists campus_profile_avatar_upload_own on storage.objects;
create policy campus_profile_avatar_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campus-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg','png','webp')
  and coalesce(metadata ->> 'mimetype','') in ('image/jpeg','image/png','image/webp')
  and coalesce(nullif(metadata ->> 'size','')::bigint,0) between 1 and 20971520
);
