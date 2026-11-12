-- Deny requests from deactivated accounts even while an already-issued JWT is still within its expiry window.

create or replace function private.account_lifecycle_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
     and not exists (
       select 1
       from public.account_lifecycle l
       where l.user_id = (select auth.uid())
         and l.status in ('deactivated','purge_blocked')
     )
     and not exists (
       select 1
       from auth.users u
       where u.id = (select auth.uid())
         and u.deleted_at is not null
     );
$function$;

revoke all on function private.account_lifecycle_is_active() from public, anon;
grant execute on function private.account_lifecycle_is_active() to authenticated, service_role;

-- Keep the existing role/verification checks, but make deactivation a global
-- access stop for the helper used by restricted campus workflows.
create or replace function private.current_user_can_use_restricted_features()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.account_lifecycle_is_active()
     and coalesce((
       select case
         when p.verification_status <> 'verified' then false
         when p.role in ('admin','security','teacher') then true
         when p.role = 'student' then exists (
           select 1 from public.student_identity_verifications siv
           where siv.user_id = p.id and siv.status = 'approved'
         )
         else false
       end
       from public.profiles p
       where p.id = (select auth.uid())
     ), false);
$function$;

-- Add a restrictive policy, not a permissive one: this ANDs with each table's
-- existing row-level policies without changing its ownership/campus rules.
do $policies$
declare
  v_table record;
begin
  for v_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity
  loop
    execute format(
      'drop policy if exists account_lifecycle_active_guard on public.%I',
      v_table.tablename
    );
    execute format(
      'create policy account_lifecycle_active_guard on public.%I as restrictive for all to authenticated using ((select private.account_lifecycle_is_active())) with check ((select private.account_lifecycle_is_active()))',
      v_table.tablename
    );
  end loop;
end;
$policies$;

-- Supabase Storage also accepts the user's JWT. Apply the same account-state
-- guard to objects so old tokens cannot continue reading/writing private files.
alter table storage.objects enable row level security;
drop policy if exists account_lifecycle_active_guard on storage.objects;
create policy account_lifecycle_active_guard
on storage.objects
as restrictive
for all
to authenticated
using ((select private.account_lifecycle_is_active()))
with check ((select private.account_lifecycle_is_active()));

-- Check the purge queue every 15 minutes. The function still refuses to act
-- before each account's exact 90-day deadline.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'campusshield-account-lifecycle-daily-purge') then
    perform cron.unschedule('campusshield-account-lifecycle-daily-purge');
  end if;
  if exists (select 1 from cron.job where jobname = 'campusshield-account-lifecycle-purge') then
    perform cron.unschedule('campusshield-account-lifecycle-purge');
  end if;

  perform cron.schedule(
    'campusshield-account-lifecycle-purge',
    '*/15 * * * *',
    'select * from private.purge_expired_account_lifecycle();'
  );
end;
$schedule$;
