-- Prevent the legacy campus-membership queue from bypassing the dedicated staff-evidence review.
-- Teacher/staff identity must be approved through campus_staff_verifications first.
begin;

create or replace function public.review_campus_staff_membership(
  p_user_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_requested_role text;
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select p.role::text, p.requested_role::text
    into v_role, v_requested_role
  from public.profiles p
  join public.campus_memberships cm on cm.user_id=p.id
  where p.id=p_user_id
    and cm.university_id=v_university_id
    and cm.membership_status='active'
    and cm.verification_status in ('unverified','pending')
    and (p.requested_role='teacher' or p.role::text in ('teacher','security','admin'));
  if not found then
    raise exception 'This staff membership request is not in your university queue.';
  end if;

  if (v_requested_role='teacher' or v_role='teacher') and not exists (
    select 1
    from public.campus_staff_verifications v
    where v.user_id=p_user_id
      and v.university_id=v_university_id
      and v.status='approved'
  ) then
    raise exception 'Teacher identity must be approved through the staff verification queue first.';
  end if;

  update public.campus_memberships
    set verification_status=case p_decision when 'approve' then 'verified' else 'rejected' end,
        campus_role=case when p_decision='approve' then v_role else campus_role end,
        updated_at=now()
  where user_id=p_user_id
    and university_id=v_university_id
    and membership_status='active';
  if not found then
    raise exception 'Campus membership could not be updated.';
  end if;
end;
$function$;

revoke all on function public.review_campus_staff_membership(uuid,text) from public, anon;
grant execute on function public.review_campus_staff_membership(uuid,text) to authenticated;

commit;
