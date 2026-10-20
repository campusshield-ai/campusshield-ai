-- CampusShield AI: auditable evidence checks for identity and payment documents.
-- This records how a reviewer checked evidence; it does not claim that OCR or an image proves authenticity.
begin;

create table if not exists public.campus_identity_evidence_checks (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('student_id','staff_id','payment_receipt')),
  outcome text not null check (outcome in ('needs_review','institution_confirmed','not_confirmed')),
  source_kind text not null check (source_kind in ('document_visual_review','official_university_email','university_registry','direct_institution_contact','official_payment_portal','other')),
  source_reference text,
  reviewer_note text,
  checked_by uuid not null references auth.users(id) on delete restrict,
  checked_at timestamptz not null default now(),
  constraint campus_identity_evidence_source_reference_length
    check (source_reference is null or length(btrim(source_reference)) between 1 and 240),
  constraint campus_identity_evidence_reviewer_note_length
    check (reviewer_note is null or length(btrim(reviewer_note)) <= 1000),
  constraint campus_identity_evidence_confirmation_has_source
    check (
      outcome <> 'institution_confirmed'
      or (
        source_kind in ('official_university_email','university_registry','direct_institution_contact','official_payment_portal')
        and nullif(btrim(source_reference), '') is not null
      )
    )
);

alter table public.campus_identity_evidence_checks enable row level security;
revoke all on table public.campus_identity_evidence_checks from public, anon, authenticated;

create or replace function private.record_campus_identity_evidence_check(
  p_subject_user_id uuid,
  p_evidence_type text,
  p_outcome text,
  p_source_kind text,
  p_source_reference text default null,
  p_reviewer_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_check_id uuid;
begin
  if v_actor is null then raise exception 'Sign in is required.'; end if;
  if (select private.current_campus_role()) is distinct from 'admin'
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified campus administrator is required.';
  end if;
  if p_evidence_type not in ('student_id','staff_id','payment_receipt') then
    raise exception 'Unsupported evidence type.';
  end if;
  if p_outcome not in ('needs_review','institution_confirmed','not_confirmed') then
    raise exception 'Unsupported evidence outcome.';
  end if;
  if p_source_kind not in ('document_visual_review','official_university_email','university_registry','direct_institution_contact','official_payment_portal','other') then
    raise exception 'Unsupported evidence source.';
  end if;
  if p_source_reference is not null and length(btrim(p_source_reference)) not between 1 and 240 then
    raise exception 'Source reference must be 1–240 characters when supplied.';
  end if;
  if p_reviewer_note is not null and length(btrim(p_reviewer_note)) > 1000 then
    raise exception 'Reviewer note must not exceed 1000 characters.';
  end if;
  if p_outcome = 'institution_confirmed'
     and (p_source_kind not in ('official_university_email','university_registry','direct_institution_contact','official_payment_portal')
          or nullif(btrim(p_source_reference), '') is null) then
    raise exception 'Institution confirmation requires an authoritative source and traceable reference.';
  end if;
  if v_university_id is null or not private.user_has_current_campus(p_subject_user_id) then
    raise exception 'The account is not a member of your university.';
  end if;
  if p_evidence_type = 'student_id' and not exists (
    select 1 from public.student_identity_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No student identity submission exists for this account at your university.'; end if;
  if p_evidence_type = 'staff_id' and not exists (
    select 1 from public.campus_staff_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No staff verification submission exists for this account at your university.'; end if;
  if p_evidence_type = 'payment_receipt' and not exists (
    select 1 from public.student_identity_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) and not exists (
    select 1 from public.campus_staff_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No related verification submission exists for this account at your university.'; end if;

  insert into public.campus_identity_evidence_checks
    (subject_user_id, university_id, evidence_type, outcome, source_kind, source_reference, reviewer_note, checked_by)
  values
    (p_subject_user_id, v_university_id, p_evidence_type, p_outcome, p_source_kind,
     nullif(btrim(p_source_reference), ''), nullif(btrim(p_reviewer_note), ''), v_actor)
  returning id into v_check_id;
  return v_check_id;
end;
$function$;

create or replace function public.record_campus_identity_evidence_check(
  p_subject_user_id uuid,
  p_evidence_type text,
  p_outcome text,
  p_source_kind text,
  p_source_reference text default null,
  p_reviewer_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_campus_identity_evidence_check(
    p_subject_user_id, p_evidence_type, p_outcome, p_source_kind, p_source_reference, p_reviewer_note
  );
$function$;

revoke all on function private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) from public, anon;
grant execute on function private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) to authenticated, service_role;
revoke all on function public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) to authenticated, service_role;

commit;
