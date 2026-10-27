-- Supabase Storage enforces the bucket's file_size_limit before accepting the upload.
-- Do not depend on metadata.size in the INSERT RLS check: Storage may not populate
-- that metadata field at policy-evaluation time, which rejects valid avatar uploads.
-- Keep owner-folder, extension, and MIME checks; the private bucket remains capped at 20 MiB.
drop policy if exists campus_profile_avatar_upload_own on storage.objects;
create policy campus_profile_avatar_upload_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campus-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg','png','webp')
  and coalesce(metadata ->> 'mimetype','') in ('image/jpeg','image/png','image/webp')
);
