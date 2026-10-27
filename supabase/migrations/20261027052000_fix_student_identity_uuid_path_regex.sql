-- Correct the student identity object-path regex.
-- A double-escaped dot rejected valid UUID-based .jpg/.jpeg/.png/.pdf paths.
-- [.] matches a literal dot without string-literal escaping ambiguity.
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
  v_university_id uuid := (select private.current_campus_university_id());
  v_institution_name text;
  v_changed integer;
  v_mime text;
  v_size bigint;
  v_identity_status text;
  v_confirmed_fraud boolean := false;
  v_verified_fraud_resubmission boolean := false;
  v_profile_status text;
begin
  if v_user_id is null then raise exception 'Sign in before submitting student identity.'; end if;
  if char_length(btrim(coalesce(p_student_number,''))) not between 2 and 80 then
    raise exception 'Student or matric number must be 2–80 characters.';
  end if;
  if char_length(btrim(coalesce(p_institution_name,''))) not between 2 and 180 then
    raise exception 'Institution name must be 2–180 characters.';
  end if;
  if v_university_id is null then raise exception 'Complete campus onboarding before submitting identity.'; end if;
  select u.name into v_institution_name from public.campus_universities u where u.id=v_university_id;
  if v_institution_name is null or lower(btrim(p_institution_name)) <> lower(btrim(v_institution_name)) then
    raise exception 'Institution must match the selected university.';
  end if;

  select siv.status,siv.confirmed_fraud into v_identity_status,v_confirmed_fraud
  from public.student_identity_verifications siv
  where siv.user_id=v_user_id and siv.university_id=v_university_id for update;
  v_confirmed_fraud := coalesce(v_confirmed_fraud,false);
  v_verified_fraud_resubmission := v_confirmed_fraud and v_identity_status='approved';

  if p_object_path is null or p_object_path !~ (
    '^' || v_user_id::text || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[.](jpg|jpeg|png|pdf)$'
  ) then raise exception 'The document path must be a safe UUID filename in your own folder.'; end if;

  select p.verification_status::text into v_profile_status
  from public.profiles p
  where p.id=v_user_id and p.role='student' and p.requested_role='student'
    and (p.verification_status='pending'
         or (v_verified_fraud_resubmission and p.verification_status='verified'))
  for update;
  if not found then raise exception 'A pending student account or fraud-flagged verified student account is required.'; end if;
  if not exists (
    select 1 from public.campus_memberships cm where cm.user_id=v_user_id
      and cm.university_id=v_university_id and cm.membership_status='active'
  ) then raise exception 'An active membership in your selected university is required.'; end if;

  select coalesce(o.metadata->>'mimetype',''),coalesce(nullif(o.metadata->>'size','')::bigint,0)
    into v_mime,v_size
  from storage.objects o where o.bucket_id='student-identity-documents'
    and o.name=p_object_path and o.owner_id=v_user_id::text;
  if not found or v_size not between 1 and 5242880 then
    raise exception 'Upload a JPEG, PNG or PDF no larger than 5 MiB first.';
  end if;
  if v_mime not in ('image/jpeg','image/png','application/pdf') then
    raise exception 'The uploaded identity document type is not allowed.';
  end if;

  insert into public.student_identity_verifications
    (user_id,university_id,institution_name,student_number,object_path,status,
     rejection_reason,reviewed_by,reviewed_at,created_at,updated_at,
     confirmed_fraud,fraud_decision_reason,fraud_decided_by,fraud_decided_at,fraud_notice_at,fraud_lock_at)
  values
    (v_user_id,v_university_id,btrim(v_institution_name),btrim(p_student_number),
     p_object_path,'pending',null,null,null,now(),now(),
     false,null,null,null,null,null)
  on conflict (user_id) do update
    set university_id=excluded.university_id,
        institution_name=excluded.institution_name,
        student_number=excluded.student_number,
        object_path=excluded.object_path,
        status='pending', rejection_reason=null, reviewed_by=null, reviewed_at=null,
        created_at=now(), updated_at=now(),
        confirmed_fraud=false, fraud_decision_reason=null, fraud_decided_by=null,
        fraud_decided_at=null, fraud_notice_at=null, fraud_lock_at=null
    where student_identity_verifications.status='rejected'
       or (student_identity_verifications.status='approved'
           and student_identity_verifications.confirmed_fraud=true);

  get diagnostics v_changed=row_count;
  if v_changed=0 then
    raise exception 'A pending or approved identity submission already exists, or the submission is not eligible for resubmission.';
  end if;

  if v_verified_fraud_resubmission then
    update public.profiles set verification_status='pending'
    where id=v_user_id and role='student' and requested_role='student'
      and verification_status='verified';
    if not found then raise exception 'Student account status changed; refresh and try again.'; end if;
  end if;
end;
$function$;
