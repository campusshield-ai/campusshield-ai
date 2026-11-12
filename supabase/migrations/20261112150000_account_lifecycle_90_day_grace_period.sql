-- Reversible account deactivation with a 90-day recovery window.
-- New deactivations use an Auth ban (not Supabase's irreversible soft-delete API).

create table if not exists public.account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','deactivated','purge_blocked')),
  deactivated_at timestamptz,
  purge_after timestamptz,
  deactivated_by uuid,
  deactivation_reason text,
  reactivated_at timestamptz,
  legacy_soft_deleted boolean not null default false,
  purge_attempts integer not null default 0,
  last_purge_attempt_at timestamptz,
  last_purge_error text,
  updated_at timestamptz not null default now(),
  constraint account_lifecycle_dates_check check (
    (status = 'active' and purge_after is null)
    or
    (status in ('deactivated','purge_blocked') and deactivated_at is not null and purge_after is not null)
  )
);

create index if not exists account_lifecycle_due_purge_idx
  on public.account_lifecycle (purge_after)
  where status in ('deactivated','purge_blocked');

alter table public.account_lifecycle enable row level security;
revoke all on table public.account_lifecycle from public, anon, authenticated;
grant all on table public.account_lifecycle to service_role;

comment on table public.account_lifecycle is
  'Private lifecycle state for reversible account deactivation. Accounts remain banned for a 90-day recovery window, then a scheduled purge removes the Auth user and owned files.';

-- The prior cleanup used Auth soft deletion, which Supabase documents as irreversible.
-- Track those legacy accounts for their existing 90-day retention deadline, but do not
-- offer a misleading Restore action for them.
insert into public.account_lifecycle (
  user_id,status,deactivated_at,purge_after,legacy_soft_deleted,
  deactivation_reason,updated_at
)
select
  u.id,
  'deactivated',
  coalesce(u.deleted_at, now()),
  coalesce(u.deleted_at, now()) + interval '90 days',
  true,
  'Legacy Auth soft-delete; Supabase Auth does not support restoring this state.',
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where u.deleted_at is not null
  and coalesce(p.role,'') <> 'admin'
  and not exists (
    select 1 from private.platform_admins pa where pa.user_id = u.id
  )
on conflict (user_id) do nothing;

-- Only a server-side service-role Edge Function may revoke all refresh sessions
-- when it deactivates an account.
create or replace function public.account_lifecycle_revoke_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_jwt_role text;
  v_deleted integer := 0;
begin
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_jwt_role <> 'service_role' then
    raise exception 'Account session revocation is server-side only' using errcode='42501';
  end if;
  if p_user_id is null then
    raise exception 'A user ID is required' using errcode='22023';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.account_lifecycle_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.account_lifecycle_revoke_sessions(uuid) to service_role;

-- Permanent purge is intentionally delayed until purge_after. It first removes
-- Storage objects and known RESTRICT references. Any unexpected FK dependency
-- is recorded and retried on the next daily run; the account stays banned.
create or replace function private.purge_expired_account_lifecycle()
returns table(purged_count integer, blocked_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_purged integer := 0;
  v_blocked integer := 0;
  v_state text;
  v_error text;
begin
  for v_row in
    select l.user_id
    from public.account_lifecycle l
    where l.status in ('deactivated','purge_blocked')
      and l.purge_after <= clock_timestamp()
    order by l.purge_after
    for update skip locked
  loop
    begin
      -- Never purge a campus administrator or trusted platform administrator.
      if exists (
        select 1 from public.profiles p
        where p.id = v_row.user_id and p.role = 'admin'
      ) or exists (
        select 1 from private.platform_admins pa
        where pa.user_id = v_row.user_id
      ) then
        update public.account_lifecycle
        set status='purge_blocked',
            purge_attempts=purge_attempts+1,
            last_purge_attempt_at=clock_timestamp(),
            last_purge_error='Protected administrator account; automatic purge refused.',
            updated_at=clock_timestamp()
        where user_id=v_row.user_id;
        v_blocked := v_blocked + 1;
        continue;
      end if;

      -- Auth refuses deletion while a user still owns Storage objects.
      delete from storage.objects
      where owner = v_row.user_id
         or owner_id = v_row.user_id::text;

      -- Detach or remove records whose foreign keys deliberately RESTRICT user deletion.
      -- These records belong to the account being permanently erased.
      delete from private.campus_class_attendance_qr_tokens
       where issued_by = v_row.user_id;
      delete from public.campus_class_attendance
       where marked_by = v_row.user_id;
      delete from public.campus_class_attendance_audit
       where changed_by = v_row.user_id;
      delete from public.campus_class_sessions
       where recorded_by = v_row.user_id;
      delete from public.campus_classroom_announcements
       where author_id = v_row.user_id;
      delete from public.campus_classroom_materials
       where uploaded_by = v_row.user_id;
      delete from public.campus_classrooms
       where teacher_id = v_row.user_id;
      update public.student_identity_verifications
       set fraud_decided_by = null
       where fraud_decided_by = v_row.user_id;

      -- Cascading FKs remove the profile and account-owned platform records.
      delete from auth.users where id = v_row.user_id;

      if found then
        v_purged := v_purged + 1;
      else
        delete from public.account_lifecycle where user_id = v_row.user_id;
      end if;
    exception when others then
      get stacked diagnostics
        v_state = returned_sqlstate,
        v_error = message_text;
      update public.account_lifecycle
      set status='purge_blocked',
          purge_attempts=purge_attempts+1,
          last_purge_attempt_at=clock_timestamp(),
          last_purge_error=left(coalesce(v_state,'') || ': ' || coalesce(v_error,'Unknown purge failure'), 1000),
          updated_at=clock_timestamp()
      where user_id=v_row.user_id;
      v_blocked := v_blocked + 1;
    end;
  end loop;

  return query select v_purged, v_blocked;
end;
$function$;

revoke all on function private.purge_expired_account_lifecycle() from public, anon, authenticated, service_role;
grant execute on function private.purge_expired_account_lifecycle() to postgres;

-- Supabase supports pg_cron on hosted projects. Run once daily; due accounts
-- are purged only after their exact 90-day deadline has elapsed.
create extension if not exists pg_cron;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'campusshield-account-lifecycle-daily-purge') then
    perform cron.unschedule('campusshield-account-lifecycle-daily-purge');
  end if;

  perform cron.schedule(
    'campusshield-account-lifecycle-daily-purge',
    '0 3 * * *',
    'select * from private.purge_expired_account_lifecycle();'
  );
end;
$schedule$;
