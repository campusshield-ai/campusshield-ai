-- RLS controls rows, not table-level privileges such as TRUNCATE.
-- Browser clients only need authenticated SELECT and narrowly scoped self-service column updates.
begin;

revoke all privileges on table public.profiles from anon, authenticated;
revoke update (display_name, requested_role) on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, requested_role) on table public.profiles to authenticated;

commit;
