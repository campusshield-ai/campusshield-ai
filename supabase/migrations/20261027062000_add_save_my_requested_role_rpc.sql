-- Persist only the authenticated user's requested student/staff role.
-- The actual profile.role remains unchanged and is controlled by the approval workflow.
-- This RPC is intentionally a no-op for verified/rejected accounts and elevated roles,
-- because the frontend may call it again after email confirmation or on later sign-ins.

create or replace function public.save_my_requested_role(p_requested_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_role text;
  v_verification_status text;
begin
  if v_user_id is null then
    raise exception 'Sign in before saving your requested role.';
  end if;

  if p_requested_role is null or p_requested_role not in ('student', 'teacher') then
    raise exception 'Requested role must be student or teacher.';
  end if;

  select p.role, p.verification_status
    into v_profile_role, v_verification_status
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'Your CampusShield profile could not be found.';
  end if;

  -- Only a pending, not-yet-approved base account may change its requested role.
  -- Never modify role or verification_status here: those require administrator review.
  if v_profile_role = 'student' and v_verification_status = 'pending' then
    update public.profiles
      set requested_role = p_requested_role
    where id = v_user_id
      and role = 'student'
      and verification_status = 'pending';
  end if;
end;
$function$;

revoke all on function public.save_my_requested_role(text) from public;
revoke all on function public.save_my_requested_role(text) from anon;
grant execute on function public.save_my_requested_role(text) to authenticated;

notify pgrst, 'reload schema';
