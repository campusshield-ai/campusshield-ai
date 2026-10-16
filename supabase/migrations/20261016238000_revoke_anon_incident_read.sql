-- Incident reports contain sensitive campus safety information.
-- Anonymous clients must not have table-level SELECT privilege; authenticated access
-- remains governed by the existing same-campus RLS policies.
begin;
revoke select on table public.incidents from anon;
commit;
