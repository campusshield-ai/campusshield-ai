-- Pending users may edit their display name and requested role only.
-- Account role, verification state, identity, and server-maintained timestamps are server-owned.
begin;

-- Remove any table-level UPDATE grant first; it overrides column-level restrictions.
revoke update on public.profiles from authenticated;
grant update (display_name, requested_role)
  on public.profiles to authenticated;

commit;
