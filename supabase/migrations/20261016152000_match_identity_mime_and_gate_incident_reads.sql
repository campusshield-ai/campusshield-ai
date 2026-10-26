-- Require file extensions to agree with the declared MIME type, and gate
-- direct incident reads for students until identity and account are approved.

begin;

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
    and (
      (lower(name) ~ (chr(92) || '.(jpg|jpeg)$') and coalesce(metadata->>'mimetype','') = 'image/jpeg')
      or (lower(name) ~ (chr(92) || '.png$') and coalesce(metadata->>'mimetype','') = 'image/png')
      or (lower(name) ~ (chr(92) || '.pdf$') and coalesce(metadata->>'mimetype','') = 'application/pdf')
    )
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
  v_name text;
  v_mime text;
  v_size bigint;
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

  select lower(o.name),coalesce(o.metadata->>'mimetype',''),
         coalesce(nullif(o.metadata->>'size','')::bigint,0)
  into v_name,v_mime,v_size
  from storage.objects o
  where o.bucket_id = 'student-identity-documents'
    and o.name = p_object_path
    and o.owner_id = v_user_id::text;

  if not found or v_size not between 1 and 5242880 then
    raise exception 'Upload a supported document no larger than 5 MiB before submitting.';
  end if;
  if not (
    (v_name ~ (chr(92) || '.(jpg|jpeg)$') and v_mime = 'image/jpeg')
    or (v_name ~ (chr(92) || '.png$') and v_mime = 'image/png')
    or (v_name ~ (chr(92) || '.pdf$') and v_mime = 'application/pdf')
  ) then
    raise exception 'The file extension must match its declared MIME type.';
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

drop policy if exists "Active users can read own incidents; verified staff can read all" on public.incidents;
drop policy if exists "Active users can read own incidents; verified staff can read al" on public.incidents;
create policy "Approved students and verified staff can read incidents"
  on public.incidents for select to authenticated
  using (
    (
      reporter_id = (select auth.uid())
      and (select private.current_user_can_use_restricted_features())
    )
    or (select private.current_campus_role()) = any (array['security','admin'])
  );

commit;
