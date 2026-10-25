-- Admin-only, read-only overview for all student reward records.
-- The private SECURITY DEFINER implementation performs the role check inside the database.
create or replace function private.get_admin_student_rewards_impl()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_verified text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in to view reward management.';
  end if;

  select p.role::text, p.verification_status::text
    into v_role, v_verified
  from public.profiles p
  where p.id = v_user_id;

  if v_role is distinct from 'admin' or v_verified is distinct from 'verified' then
    raise exception 'Verified administrators only.';
  end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.id,
        'display_name', coalesce(nullif(btrim(s.display_name), ''), 'Student'),
        'total_points', coalesce(pts.total_points, 0),
        'badges_earned', coalesce(badges.badges_earned, 0),
        'challenges_completed', coalesce(challenges.challenges_completed, 0),
        'last_points_awarded', pts.last_points_awarded
      ) order by coalesce(pts.total_points, 0) desc, s.created_at desc)
      from public.profiles s
      left join lateral (
        select sum(l.points)::integer as total_points, max(l.awarded_at) as last_points_awarded
        from public.student_points_ledger l where l.user_id = s.id
      ) pts on true
      left join lateral (
        select count(*)::integer as badges_earned
        from public.student_user_badges b where b.user_id = s.id
      ) badges on true
      left join lateral (
        select count(*)::integer as challenges_completed
        from public.student_challenge_progress cp
        where cp.user_id = s.id and cp.completed_at is not null
      ) challenges on true
      where s.role = 'student'
    ), '[]'::jsonb),
    'student_count', (select count(*)::integer from public.profiles s where s.role = 'student'),
    'points_total', (select coalesce(sum(l.points), 0)::integer from public.student_points_ledger l),
    'badges_total', (select count(*)::integer from public.student_user_badges),
    'challenges_completed_total', (
      select count(*)::integer from public.student_challenge_progress cp where cp.completed_at is not null
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function private.get_admin_student_rewards_impl() from public, anon, authenticated;
grant execute on function private.get_admin_student_rewards_impl() to authenticated;

create or replace function public.get_admin_student_rewards()
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $function$
  select private.get_admin_student_rewards_impl();
$function$;

revoke all on function public.get_admin_student_rewards() from public, anon;
grant execute on function public.get_admin_student_rewards() to authenticated;
