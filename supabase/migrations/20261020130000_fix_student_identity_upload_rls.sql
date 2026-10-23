-- Fix the upload-time RLS gate without weakening server-side campus authorization.
-- Storage allows a pending student to upload only a supported identity file into their own folder.
-- The submission RPC still requires active campus membership and deletes failed uploads client-side.
begin;

drop policy if exists student_identity_upload_own_pending on storage.objects;
create policy student_identity_upload_own_pending
  on storage.objects for insert to authenticated with check (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ (
      '^' || (select auth.uid())::text ||
      '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|png|pdf)$'
    )
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.requested_role::text = 'student'
        and p.verification_status::text = 'pending'
    )
  );

commit;