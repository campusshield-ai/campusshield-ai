-- Correct SQL regex escaping in the production identity object paths.
-- chr(92) explicitly contributes one regex escape character under standard_conforming_strings.

begin;

alter table public.student_identity_verifications
  drop constraint if exists student_identity_safe_path_check;

alter table public.student_identity_verifications
  add constraint student_identity_safe_path_check
  check (
    object_path ~ (
      '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}' ||
      chr(92) || '.(jpg|jpeg|png|pdf)$'
    )
  );

drop policy if exists student_identity_upload_own_pending on storage.objects;
create policy student_identity_upload_own_pending
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ (
      '^' || (select auth.uid())::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
      chr(92) || '.(jpg|jpeg|png|pdf)$'
    )
    and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','application/pdf')
    and coalesce(nullif(metadata->>'size','')::bigint,0) between 1 and 5242880
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'student'
        and p.requested_role = 'student'
        and p.verification_status in ('pending','verified')
    )
  );

create or replace function private.submit_student_identity_verification(
  p_institution_name text,
  p_student_number text,
  p_object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_changed integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before submitting student identity.';
  end if;
  if char_length(btrim(coalesce(p_institution_name,''))) not between 2 and 180 then
    raise exception 'Institution name must be 2–180 characters.';
  end if;
  if char_length(btrim(coalesce(p_student_number,''))) not between 2 and 80 then
    raise exception 'Student or matric number must be 2–80 characters.';
  end if;
  if p_object_path is null or p_object_path !~ (
    '^' || v_user_id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    chr(92) || '.(jpg|jpeg|png|pdf)$'
  ) then
    raise exception 'The document path must be a safe filename in your own folder.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'student'
      and p.requested_role = 'student'
      and p.verification_status in ('pending','verified')
  ) then
    raise exception 'A pending or previously verified student account is required.';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'student-identity-documents'
      and o.name = p_object_path
      and o.metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')
      and coalesce(nullif(o.metadata->>'size','')::bigint,0) between 1 and 5242880
  ) then
    raise exception 'Upload a supported JPEG, PNG or PDF no larger than 5 MiB before submitting.';
  end if;

  insert into public.student_identity_verifications
    (user_id,institution_name,student_number,object_path,status,rejection_reason,reviewed_by,reviewed_at,created_at,updated_at)
  values
    (v_user_id,btrim(p_institution_name),btrim(p_student_number),p_object_path,'pending',null,null,null,now(),now())
  on conflict (user_id) do update
    set institution_name = excluded.institution_name,
        student_number = excluded.student_number,
        object_path = excluded.object_path,
        status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now(),
        updated_at = now()
    where student_identity_verifications.status = 'rejected';

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'An identity submission is already pending or has been approved.';
  end if;

  update public.profiles
  set verification_status = 'pending'
  where id = v_user_id
    and role = 'student'
    and requested_role = 'student'
    and verification_status in ('pending','verified');
  if not found then
    raise exception 'Student account status changed; refresh and try again.';
  end if;
end;
$function$;

commit;
