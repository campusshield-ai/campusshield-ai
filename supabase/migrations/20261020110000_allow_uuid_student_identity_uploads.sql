-- Allow the browser-generated UUID filenames while keeping uploads in the authenticated user's private folder.
-- Staging-forward-only fix: no production migration has been applied.
begin;

-- The earlier function definition escaped the filename dot twice, which does not
-- match a normal ".jpg/.png/.pdf" filename with PostgreSQL's regex engine.
do $migration$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('private.submit_student_identity_verification(text,text,text)'::regprocedure);
  v_definition := replace(v_definition, chr(92) || chr(92) || '.', '[.]');
  if v_definition = pg_get_functiondef('private.submit_student_identity_verification(text,text,text)'::regprocedure) then
    raise exception 'Expected filename regex pattern was not found; stop and review the staging function definition.';
  end if;
  execute v_definition;
end;
$migration$;

alter table public.student_identity_verifications
  drop constraint if exists student_identity_path_matches_user;

alter table public.student_identity_verifications
  add constraint student_identity_path_matches_user
  check (
    object_path = user_id::text || '/student-identity-document'
    or object_path ~ (
      '^' || user_id::text ||
      '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|pdf)$'
    )
  );

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
        and (select private.current_campus_university_id()) is not null
        and private.user_has_current_campus((select auth.uid()))
    )
  );

commit;
