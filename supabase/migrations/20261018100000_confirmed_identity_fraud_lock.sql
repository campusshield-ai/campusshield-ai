-- CampusShield AI: confirmed-fraud correction window and campus-scoped access restriction.
-- This migration is for the multi-campus staging schema only.
-- Normal identity rejection never starts a fraud deadline.

begin;

alter table public.student_identity_verifications
  add column if not exists confirmed_fraud boolean not null default false,
  add column if not exists fraud_decision_reason text,
  add column if not exists fraud_decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists fraud_decided_at timestamptz,
  add column if not exists fraud_notice_at timestamptz,
  add column if not exists fraud_lock_at timestamptz;

alter table public.student_identity_verifications
  drop constraint if exists student_identity_fraud_reason_length;
alter table public.student_identity_verifications
  add constraint student_identity_fraud_reason_length
  check (fraud_decision_reason is null
         or char_length(btrim(fraud_decision_reason)) between 5 and 1000);

create index if not exists student_identity_fraud_lock_due_idx
  on public.student_identity_verifications (fraud_lock_at)
  where confirmed_fraud = true and fraud_lock_at is not null;

-- Preserve every existing campus-role check and add the timed restriction only
-- to this signed-in user's own identity record. No campus-wide or cross-account
-- flag can be used to probe another user's status.
create or replace function private.current_user_has_verified_campus_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.verification_status = 'verified'
      and (
        (
          (p.requested_role = 'student' or p.role = 'student')
          and coalesce((select private.current_campus_role()), '') = 'student'
        )
        or (
          p.role in ('teacher','security','admin')
          and coalesce((select private.current_campus_role()), '') in ('teacher','security','admin')
        )
      )
      and not exists (
        select 1
        from public.student_identity_verifications siv
        where siv.user_id = p.id
          and siv.confirmed_fraud = true
          and siv.fraud_lock_at is not null
          and now() >= siv.fraud_lock_at
      )
  );
$function$;
revoke all on function private.current_user_has_verified_campus_access() from public, anon;
grant execute on function private.current_user_has_verified_campus_access() to authenticated, service_role;

-- The reviewer must be a verified administrator for the same campus. Normal
-- approve/reject stays the existing pending-only workflow. A fraud finding may
-- be recorded either on a pending application (no restricted access is granted
-- while pending) or an already-approved student; for approved students the
-- current access continues only until the 48-hour deadline.
create or replace function private.review_student_identity_verification(
  p_user_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
  v_target_role text;
  v_target_requested_role text;
  v_target_status text;
  v_identity_status text;
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before reviewing student identity.';
  end if;

  select p.role::text, p.verification_status::text
    into v_admin_role, v_admin_status
  from public.profiles p
  where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin'
     or v_admin_status is distinct from 'verified'
     or coalesce((select private.current_campus_role()), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;

  if p_decision is null or p_decision not in ('approve','reject','fraud') then
    raise exception 'Decision must be approve, reject, or fraud.';
  end if;

  if v_university_id is null or not (select private.user_has_current_campus(p_user_id)) then
    raise exception 'This account is not a member of your university.';
  end if;

  if p_decision in ('reject','fraud')
     and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'Provide a reason between 5 and 1000 characters.';
  end if;

  select p.role::text, p.requested_role::text, p.verification_status::text
    into v_target_role, v_target_requested_role, v_target_status
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found
     or v_target_role is distinct from 'student'
     or v_target_requested_role is distinct from 'student' then
    raise exception 'Student account not found for identity review.';
  end if;

  select siv.status
    into v_identity_status
  from public.student_identity_verifications siv
  where siv.user_id = p_user_id
    and siv.university_id = v_university_id
  for update;

  if not found then
    raise exception 'Student identity submission not found at your university.';
  end if;

  if p_decision = 'fraud' then
    if v_target_status not in ('pending','verified') then
      raise exception 'Fraud findings can only be recorded for pending or verified student accounts.';
    end if;
    if not (
      (v_identity_status = 'pending' and v_target_status = 'pending')
      or
      (v_identity_status = 'approved' and v_target_status = 'verified')
    ) then
      raise exception 'The identity and account status do not match an eligible fraud-review state.';
    end if;

    update public.student_identity_verifications
    set status = case when v_target_status = 'pending' then 'rejected' else 'approved' end,
        rejection_reason = case when v_target_status = 'pending' then btrim(p_rejection_reason) else null end,
        confirmed_fraud = true,
        fraud_decision_reason = btrim(p_rejection_reason),
        fraud_decided_by = (select auth.uid()),
        fraud_decided_at = now(),
        fraud_notice_at = now(),
        fraud_lock_at = now() + interval '48 hours',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id
      and university_id = v_university_id;
    return;
  end if;

  -- Ordinary approve/reject is deliberately limited to a pending application.
  if v_target_status is distinct from 'pending' or v_identity_status is distinct from 'pending' then
    raise exception 'Pending student application and identity submission not found.';
  end if;

  if p_decision = 'approve' then
    update public.student_identity_verifications
    set status = 'approved',
        rejection_reason = null,
        confirmed_fraud = false,
        fraud_decision_reason = null,
        fraud_decided_by = null,
        fraud_decided_at = null,
        fraud_notice_at = null,
        fraud_lock_at = null,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id and university_id = v_university_id and status = 'pending';

    perform public.review_campus_account(p_user_id, 'approve');
  else
    update public.student_identity_verifications
    set status = 'rejected',
        rejection_reason = btrim(p_rejection_reason),
        confirmed_fraud = false,
        fraud_decision_reason = null,
        fraud_decided_by = null,
        fraud_decided_at = null,
        fraud_notice_at = null,
        fraud_lock_at = null,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id and university_id = v_university_id and status = 'pending';
    -- The account remains pending; the student can sign in, correct and resubmit.
  end if;
end;
$function$;
revoke all on function private.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function private.review_student_identity_verification(uuid,text,text) to authenticated;

create or replace function public.review_student_identity_verification(
  p_user_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.review_student_identity_verification($1,$2,$3);
$function$;
revoke all on function public.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function public.review_student_identity_verification(uuid,text,text) to authenticated;

-- Allow a fraud-flagged verified student to upload a new private object and
-- resubmit. The resubmission clears the timer and immediately returns the
-- account to pending review; the existing admin approval workflow restores
-- verified membership only after the new identity is approved.
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

  select u.name into v_institution_name
  from public.campus_universities u where u.id = v_university_id;
  if v_institution_name is null or lower(btrim(p_institution_name)) <> lower(btrim(v_institution_name)) then
    raise exception 'Institution must match the selected university.';
  end if;

  select siv.status, siv.confirmed_fraud
    into v_identity_status, v_confirmed_fraud
  from public.student_identity_verifications siv
  where siv.user_id = v_user_id
    and siv.university_id = v_university_id
  for update;
  v_confirmed_fraud := coalesce(v_confirmed_fraud, false);
  v_verified_fraud_resubmission := v_confirmed_fraud and v_identity_status = 'approved';

  if p_object_path is null or p_object_path !~ (
    '^' || v_user_id::text || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|pdf)$'
  ) then
    raise exception 'The document path must be a safe UUID filename in your own folder.';
  end if;

  select p.verification_status::text into v_profile_status
  from public.profiles p
  where p.id = v_user_id
    and p.role = 'student'
    and p.requested_role = 'student'
    and (
      p.verification_status = 'pending'
      or (v_verified_fraud_resubmission and p.verification_status = 'verified')
    )
  for update;
  if not found then
    raise exception 'A pending student account or fraud-flagged verified student account is required.';
  end if;

  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
  ) then raise exception 'An active membership in your selected university is required.'; end if;

  select coalesce(o.metadata->>'mimetype',''),
         coalesce(nullif(o.metadata->>'size','')::bigint,0)
    into v_mime, v_size
  from storage.objects o
  where o.bucket_id = 'student-identity-documents'
    and o.name = p_object_path
    and o.owner_id = v_user_id::text;

  if not found or v_size not between 1 and 5242880 then
    raise exception 'Upload a JPEG, PNG or PDF no larger than 5 MiB first.';
  end if;
  if v_mime not in ('image/jpeg','image/png','application/pdf') then
    raise exception 'The uploaded identity document type is not allowed.';
  end if;

  insert into public.student_identity_verifications
    (user_id, university_id, institution_name, student_number, object_path, status,
     rejection_reason, reviewed_by, reviewed_at, created_at, updated_at,
     confirmed_fraud, fraud_decision_reason, fraud_decided_by, fraud_decided_at, fraud_notice_at, fraud_lock_at)
  values
    (v_user_id, v_university_id, btrim(v_institution_name), btrim(p_student_number),
     p_object_path, 'pending', null, null, null, now(), now(),
     false, null, null, null, null, null)
  on conflict (user_id) do update
    set university_id = excluded.university_id,
        institution_name = excluded.institution_name,
        student_number = excluded.student_number,
        object_path = excluded.object_path,
        status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now(),
        updated_at = now(),
        confirmed_fraud = false,
        fraud_decision_reason = null,
        fraud_decided_by = null,
        fraud_decided_at = null,
        fraud_notice_at = null,
        fraud_lock_at = null
    where student_identity_verifications.status = 'rejected'
       or (student_identity_verifications.status = 'approved'
           and student_identity_verifications.confirmed_fraud = true);

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'A pending or approved identity submission already exists, or the submission is not eligible for resubmission.';
  end if;

  if v_verified_fraud_resubmission then
    update public.profiles
    set verification_status = 'pending'
    where id = v_user_id
      and role = 'student'
      and requested_role = 'student'
      and verification_status = 'verified';
    if not found then raise exception 'Student account status changed; refresh and try again.'; end if;
  end if;
end;
$function$;
revoke all on function private.submit_student_identity_verification(text,text,text) from public, anon;
grant execute on function private.submit_student_identity_verification(text,text,text) to authenticated;

create or replace function public.submit_student_identity_verification(
  p_institution_name text,
  p_student_number text,
  p_object_path text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.submit_student_identity_verification($1,$2,$3);
$function$;
revoke all on function public.submit_student_identity_verification(text,text,text) from public, anon;
grant execute on function public.submit_student_identity_verification(text,text,text) to authenticated;

-- Self-only notice/status RPC. It returns no names, campus IDs, or other users' data.
create or replace function private.my_identity_fraud_lock_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'confirmed_fraud', siv.confirmed_fraud,
      'notice_at', siv.fraud_notice_at,
      'lock_at', siv.fraud_lock_at,
      'locked', siv.confirmed_fraud
                and siv.fraud_lock_at is not null
                and now() >= siv.fraud_lock_at,
      'reason', siv.fraud_decision_reason
    )
    from public.student_identity_verifications siv
    where siv.user_id = (select auth.uid())
  ), jsonb_build_object('confirmed_fraud', false, 'locked', false));
$function$;
revoke all on function private.my_identity_fraud_lock_status() from public, anon;
grant execute on function private.my_identity_fraud_lock_status() to authenticated;

create or replace function public.my_identity_fraud_lock_status()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.my_identity_fraud_lock_status();
$function$;
revoke all on function public.my_identity_fraud_lock_status() from public, anon;
grant execute on function public.my_identity_fraud_lock_status() to authenticated;

commit;
