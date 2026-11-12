-- Ensure the lifecycle guard wraps, rather than replaces, each project's
-- existing verified-campus authorization rules. This follow-up also protects
-- projects where the earlier staging rollout already applied the first guard.

do $preserve_helper$
declare
  v_definition text;
begin
  if to_regprocedure('private.current_user_has_verified_campus_access_pre_lifecycle()') is null then
    v_definition := pg_get_functiondef(
      'private.current_user_has_verified_campus_access()'::regprocedure
    );
    v_definition := replace(
      v_definition,
      'FUNCTION private.current_user_has_verified_campus_access()',
      'FUNCTION private.current_user_has_verified_campus_access_pre_lifecycle()'
    );
    execute v_definition;
  end if;
end;
$preserve_helper$;

revoke all on function private.current_user_has_verified_campus_access_pre_lifecycle()
  from public, anon, authenticated, service_role;
grant execute on function private.current_user_has_verified_campus_access_pre_lifecycle()
  to postgres;

create or replace function private.current_user_has_verified_campus_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.account_lifecycle_is_active()
     and coalesce(
       (select private.current_user_has_verified_campus_access_pre_lifecycle()),
       false
     );
$function$;

revoke all on function private.current_user_has_verified_campus_access() from public, anon;
grant execute on function private.current_user_has_verified_campus_access() to authenticated, service_role;
