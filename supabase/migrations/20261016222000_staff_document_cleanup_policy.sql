-- Permit a user to clean up an unreferenced failed upload or replace a rejected application document.
begin;
drop policy if exists campus_staff_document_delete_own_rejected on storage.objects;
create policy campus_staff_document_delete_own_rejected
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'campus-staff-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not exists (
        select 1 from public.campus_staff_verifications v
        where v.document_path = storage.objects.name
      )
      or exists (
        select 1 from public.campus_staff_verifications v
        where v.user_id = (select auth.uid())
          and v.document_path = storage.objects.name
          and v.status = 'rejected'
      )
    )
  );
commit;
