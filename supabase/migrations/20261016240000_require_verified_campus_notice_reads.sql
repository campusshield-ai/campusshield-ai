-- The noticeboard is a verified-campus feature. Keep the existing audience and
-- expiry filters, but require verified campus identity as an additional RLS condition.
-- This must be RESTRICTIVE because PostgreSQL ORs permissive SELECT policies together.
begin;

drop policy if exists campus_notices_require_verified_campus_access
  on public.campus_notices;

create policy campus_notices_require_verified_campus_access
on public.campus_notices
as restrictive
for select
to authenticated
using (
  (select private.current_user_has_verified_campus_access())
);

commit;
