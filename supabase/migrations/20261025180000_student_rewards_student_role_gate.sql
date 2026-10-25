-- Enforce student-only rewards at the public RPC boundary as well as the UI.
create or replace function public.get_my_student_rewards()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Sign in to view your student rewards.';
  end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role is distinct from 'student' then
    raise exception 'Challenges and rewards are available to student accounts only.';
  end if;

  return private.get_my_student_rewards_impl();
end;
$function$;

revoke all on function public.get_my_student_rewards() from public, anon;
grant execute on function public.get_my_student_rewards() to authenticated;