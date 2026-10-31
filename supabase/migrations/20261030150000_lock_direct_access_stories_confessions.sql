-- Explicitly deny direct Data API access. The only supported access path is the
-- authenticated, university-scoped RPC surface created in the prior migration.
begin;
create policy campus_stories_no_direct_access
  on public.campus_stories for all to authenticated
  using (false) with check (false);
create policy campus_confessions_no_direct_access
  on public.campus_confessions for all to authenticated
  using (false) with check (false);
create policy campus_confession_reports_no_direct_access
  on public.campus_confession_reports for all to authenticated
  using (false) with check (false);
create policy campus_confession_identity_audit_no_direct_access
  on public.campus_confession_identity_audit for all to authenticated
  using (false) with check (false);
commit;
