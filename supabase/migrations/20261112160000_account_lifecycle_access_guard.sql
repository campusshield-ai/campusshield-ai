-- Deny requests from deactivated accounts even while an already-issued JWT is
-- within its expiry window. Apply a restrictive row-level policy to every RLS
-- enabled public table without changing each table's existing ownership rules.

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
         and (u.deleted_at is not null or u.banned_until > clock_timestamp())
     );
$function$;

revoke all on function private.account_lifecycle_is_active() from public, anon;
grant execute on function private.account_lifecycle_is_active() to authenticated, service_role;

-- This staging schema uses current_user_has_verified_campus_access() as a
-- shared authorization guard across campus interaction and Storage policies.
-- Require the account lifecycle to be active before verified access is granted.
create or replace function private.current_user_has_verified_campus_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.account_lifecycle_is_active()
     and exists (
       select 1
       from public.profiles p
       where p.id = (select auth.uid())
         and p.verification_status = 'verified'
         and (
           (
             (p.requested_role = 'student' or p.role = 'student')
             and coalesce((select private.current_campus_role()), '') = 'student'
           )
           or (
             p.role in ('teacher','security','admin')
             and coalesce((select private.current_campus_role()), '') in ('teacher','security','admin')
           )
         )
         and not exists (
           select 1 from public.student_identity_verifications siv
           where siv.user_id = p.id and siv.confirmed_fraud = true
             and siv.fraud_lock_at is not null and now() >= siv.fraud_lock_at
         )
     );
$function$;

-- A restrictive policy is ANDed with each existing permissive ownership and
-- campus-membership policy. It therefore blocks a deactivated JWT on exposed
-- public tables without broadening any user's existing access.
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

-- Storage's objects table is owned by Supabase's managed storage role and
-- cannot be altered by this project's migration role. Auth bans and session
-- revocation stop new sessions; already-issued access tokens retain their
-- normal short JWT expiry. Existing Storage policies that use the verified
-- campus helper above will also reject deactivated users.

-- Run the purge queue every 15 minutes. The purge function still checks each
-- account's exact 90-day deadline before permanently removing anything.
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
    '* * * * *',
    'select * from private.purge_expired_account_lifecycle();'
  );
end;
$schedule$;
