-- Require approved staff evidence before the generic account queue can activate a teacher.
-- Student identity approval remains a separate prerequisite for student activation.
begin;

create or replace function public.review_campus_account(
  p_user_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
  v_requested_role text;
  v_university_id uuid := (select private.current_campus_university_id());
begin
  select p.role::text, p.verification_status::text
    into v_admin_role, v_admin_status
  from public.profiles p
  where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin'
     or v_admin_status is distinct from 'verified'
     or coalesce((select private.current_campus_role()), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;
  if not (select private.user_has_current_campus(p_user_id)) then
    raise exception 'This account is not a member of your university.';
  end if;

  select p.requested_role::text
    into v_requested_role
  from public.profiles p
  where p.id = p_user_id
    and p.verification_status::text = 'pending';
  if not found then
    raise exception 'Pending account not found.';
  end if;
  if v_requested_role not in ('student', 'teacher') then
    raise exception 'Only student and teacher requests can be reviewed here.';
  end if;

  if p_decision = 'approve' and v_requested_role = 'student' and not exists (
    select 1
    from public.student_identity_verifications siv
    where siv.user_id = p_user_id
      and siv.status = 'approved'
      and siv.university_id = v_university_id
  ) then
    raise exception 'Approve the student identity document before approving this account.';
  end if;

  if p_decision = 'approve' and v_requested_role = 'teacher' and not exists (
    select 1
    from public.campus_staff_verifications csv
    where csv.user_id = p_user_id
      and csv.university_id = v_university_id
      and csv.status = 'approved'
  ) then
    raise exception 'Approve the staff identity verification before approving this account.';
  end if;

  if p_decision = 'approve' then
    update public.profiles
    set role = v_requested_role, verification_status = 'verified'
    where id = p_user_id and verification_status::text = 'pending';
    if not found then raise exception 'The account could not be updated.'; end if;

    update public.campus_memberships
    set campus_role = v_requested_role, verification_status='verified', updated_at = now()
    where user_id = p_user_id
      and university_id = v_university_id
      and membership_status = 'active';
    if not found then raise exception 'The campus membership could not be updated.'; end if;
  else
    update public.profiles
    set verification_status = 'rejected'
    where id = p_user_id and verification_status::text = 'pending';
    if not found then raise exception 'The account could not be updated.'; end if;
  end if;
end;
$function$;

revoke all on function public.review_campus_account(uuid,text) from public, anon;
grant execute on function public.review_campus_account(uuid,text) to authenticated;

commit;
