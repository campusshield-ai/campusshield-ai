-- CampusShield AI: confirmed-fraud correction window and server-side restriction.
-- STAGING REVIEW ONLY. Do not apply to production without explicit approval.
-- A normal rejection is not a fraud finding and never starts this timer.

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
  check (fraud_decision_reason is null or char_length(btrim(fraud_decision_reason)) between 5 and 1000);

create index if not exists student_identity_fraud_lock_due_idx
  on public.student_identity_verifications (fraud_lock_at)
  where confirmed_fraud = true and fraud_lock_at is not null;

-- This helper evaluates the deadline at request time, so it does not depend on
-- a browser timer or a cron job. It exposes only the signed-in user's own state.
create or replace function private.current_user_identity_fraud_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.student_identity_verifications siv
    where siv.user_id = (select auth.uid())
      and siv.confirmed_fraud = true
      and siv.fraud_lock_at is not null
      and now() >= siv.fraud_lock_at
      and siv.status = 'rejected'
  );
$function$;
revoke all on function private.current_user_identity_fraud_locked() from public, anon;
grant execute on function private.current_user_identity_fraud_locked() to authenticated;

-- Keep the existing restricted-feature gate, adding the server-side deadline.
create or replace function private.current_user_can_use_restricted_features()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select not (select private.current_user_identity_fraud_locked())
    and coalesce((
      select case
        when p.verification_status <> 'verified' then false
        when p.role in ('admin','security','teacher') then true
        when p.role = 'student' then exists (
          select 1 from public.student_identity_verifications siv
          where siv.user_id = p.id and siv.status = 'approved'
        )
        else false
      end
      from public.profiles p
      where p.id = (select auth.uid())
    ), false);
$function$;
revoke all on function private.current_user_can_use_restricted_features() from public, anon;
grant execute on function private.current_user_can_use_restricted_features() to authenticated;

-- Replace the privileged review function with an explicit third decision.
-- Only verified admins can confirm fraud. Normal reject never starts a lock.
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
begin
  select p.role::text,p.verification_status::text
    into v_admin_role,v_admin_status
  from public.profiles p
  where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified' then
    raise exception 'Only a verified administrator can review student identity.';
  end if;
  if p_decision is null or p_decision not in ('approve','reject','fraud') then
    raise exception 'Decision must be approve, reject, or fraud.';
  end if;
  if p_decision in ('reject','fraud')
     and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'Provide a reason between 5 and 1000 characters.';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_user_id
    and p.role = 'student'
    and p.requested_role = 'student'
    and p.verification_status = 'pending'
  for update;
  if not found then
    raise exception 'Pending student application not found.';
  end if;

  perform 1
  from public.student_identity_verifications siv
  where siv.user_id = p_user_id
    and siv.status = 'pending'
  for update;
  if not found then
    raise exception 'Pending student identity submission not found.';
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
    where user_id = p_user_id and status = 'pending';

    update public.profiles
    set role = 'student', verification_status = 'verified'
    where id = p_user_id and role = 'student'
      and requested_role = 'student' and verification_status = 'pending';
    if not found then raise exception 'Student account could not be approved.'; end if;

  elsif p_decision = 'reject' then
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
    where user_id = p_user_id and status = 'pending';
    -- Ordinary rejection allows correction/resubmission; no fraud timer is set.

  else
    update public.student_identity_verifications
    set status = 'rejected',
        rejection_reason = btrim(p_rejection_reason),
        confirmed_fraud = true,
        fraud_decision_reason = btrim(p_rejection_reason),
        fraud_decided_by = (select auth.uid()),
        fraud_decided_at = now(),
        fraud_notice_at = now(),
        fraud_lock_at = now() + interval '48 hours',
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id and status = 'pending';
    -- The correction window starts when the verified admin records and sends
    -- this notice. At the deadline, restricted features are denied by RLS/RPC
    -- checks. The student can still sign in to see the notice and appeal.
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

-- Safe status RPC returns only the current user's own lock timing.
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
      'locked', siv.confirmed_fraud and siv.fraud_lock_at is not null
                and now() >= siv.fraud_lock_at and siv.status = 'rejected',
      'reason', siv.fraud_decision_reason
    )
    from public.student_identity_verifications siv
    where siv.user_id = (select auth.uid())
  ), jsonb_build_object('confirmed_fraud',false,'locked',false));
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
