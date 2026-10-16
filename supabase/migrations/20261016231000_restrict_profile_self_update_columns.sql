-- Pending users may edit their display name and requested role only.
-- Account role, verification state, identity, and server-maintained timestamps are server-owned.
begin;

revoke update (id, role, verification_status, created_at, last_profile_edit_at)
  on public.profiles from authenticated;
grant update (display_name, requested_role)
  on public.profiles to authenticated;

commit;
