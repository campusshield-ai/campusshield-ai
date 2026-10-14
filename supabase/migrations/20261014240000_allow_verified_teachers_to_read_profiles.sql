-- Verified teachers may view private profile records as requested.
-- Profile emails are not stored in public.profiles and remain in Supabase Auth.
begin;

drop policy if exists "Users can read own profile; verified staff can read profiles" on public.profiles;

create policy "Users can read own profile; verified staff can read profiles"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.current_campus_role() = any (array['admin', 'security', 'teacher'])
  );

commit;
