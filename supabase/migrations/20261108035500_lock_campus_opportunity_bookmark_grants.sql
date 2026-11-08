-- Restrict bookmark table privileges to the operations the client actually uses.
-- RLS remains authoritative; this additionally removes unnecessary SQL privileges.
begin;

revoke all on table public.campus_opportunity_bookmarks
  from public, anon, authenticated;

grant select, insert, delete
  on table public.campus_opportunity_bookmarks
  to authenticated;

grant all
  on table public.campus_opportunity_bookmarks
  to service_role;

commit;
