-- Explicit deny-all RLS policies document the RPC-only access model.
begin;
drop policy if exists campus_member_blocks_deny_direct_access on public.campus_member_blocks;
create policy campus_member_blocks_deny_direct_access
  on public.campus_member_blocks
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists campus_social_notifications_deny_direct_access on public.campus_social_notifications;
create policy campus_social_notifications_deny_direct_access
  on public.campus_social_notifications
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
commit;
