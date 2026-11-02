-- Remove unnecessary table-level powers that RLS cannot constrain (notably TRUNCATE).
-- Keep intended row-level CRUD grants in place for authenticated application flows.
begin;

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from anon, authenticated',
      t.schemaname, t.tablename
    );
  end loop;
end;
$$;

-- Anonymous users may read active university directory entries, but may not mutate
-- the directory or create, modify, or delete incident records.
revoke insert, update, delete, truncate, references, trigger
  on table public.campus_universities from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.incidents from anon;

-- University directory changes must go through trusted administrative workflows.
revoke insert, update, delete
  on table public.campus_universities from authenticated;

commit;
