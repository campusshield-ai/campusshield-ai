-- Reward approved Campus Stories through the existing student challenge and points ledger.
-- Confessions remain unrewarded; sensitive disclosure should never be incentivised.
begin;

alter table public.student_challenges
  drop constraint if exists student_challenges_activity_type_check;
alter table public.student_challenges
  add constraint student_challenges_activity_type_check
  check (activity_type in ('study_sessions','campus_contribution','course_discussion','campus_story'));

insert into public.student_challenges (id,title,description,activity_type,target_count,points,active)
values (
  'campus_story_weekly',
  'Share a helpful campus story',
  'Publish one constructive campus story that passes moderation this week.',
  'campus_story',
  1,
  15,
  true
)
on conflict (id) do update set
  title=excluded.title,
  description=excluded.description,
  activity_type=excluded.activity_type,
  target_count=excluded.target_count,
  points=excluded.points,
  active=true,
  updated_at=now();

create index if not exists campus_stories_author_published_week_idx
  on public.campus_stories(university_id,author_id,published_at)
  where status='published';

create or replace function private.get_my_student_rewards_impl()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_week_start timestamptz := date_trunc('week', now());
  v_challenge record;
  v_activity_count integer;
  v_total_points integer := 0;
begin
  if v_user_id is null then raise exception 'Sign in to view your student rewards.'; end if;

  for v_challenge in
    select c.id,c.activity_type,c.target_count,c.points
    from public.student_challenges c where c.active=true order by c.id
  loop
    v_activity_count := 0;
    if v_challenge.activity_type='study_sessions' then
      select count(*)::integer into v_activity_count
      from public.shieldmind_planner_items p
      where p.user_id=v_user_id and p.kind='revision' and p.completed=true
        and p.updated_at>=v_week_start and p.updated_at<v_week_start+interval '7 days';
    elsif v_challenge.activity_type='campus_contribution' then
      if v_university_id is not null then
        select count(*)::integer into v_activity_count
        from public.community_posts p
        where p.author_id=v_user_id and p.university_id=v_university_id and p.status='published'
          and p.post_type in ('suggestion','campus_update','question')
          and p.created_at>=v_week_start and p.created_at<v_week_start+interval '7 days';
      end if;
    elsif v_challenge.activity_type='course_discussion' then
      if v_university_id is not null then
        select count(*)::integer into v_activity_count
        from public.campus_course_community_messages m
        where m.author_id=v_user_id and m.university_id=v_university_id and m.status='published'
          and m.created_at>=v_week_start and m.created_at<v_week_start+interval '7 days';
      end if;
    elsif v_challenge.activity_type='campus_story' then
      if v_university_id is not null then
        select count(*)::integer into v_activity_count
        from public.campus_stories s
        where s.author_id=v_user_id and s.university_id=v_university_id and s.status='published'
          and s.published_at>=v_week_start and s.published_at<v_week_start+interval '7 days';
      end if;
    end if;

    insert into public.student_challenge_progress
      (user_id,challenge_id,period_start,progress_count,completed_at,updated_at)
    values
      (v_user_id,v_challenge.id,v_week_start::date,least(v_activity_count,v_challenge.target_count),
       case when v_activity_count>=v_challenge.target_count then now() else null end,now())
    on conflict (user_id,challenge_id,period_start) do update set
      progress_count=excluded.progress_count,
      completed_at=case when excluded.progress_count>=v_challenge.target_count
        then coalesce(public.student_challenge_progress.completed_at,now()) else null end,
      updated_at=now();

    if v_activity_count>=v_challenge.target_count then
      insert into public.student_points_ledger(user_id,challenge_id,period_start,points)
      values(v_user_id,v_challenge.id,v_week_start::date,v_challenge.points)
      on conflict(user_id,challenge_id,period_start) do nothing;
    end if;
  end loop;

  select coalesce(sum(l.points),0)::integer into v_total_points
  from public.student_points_ledger l where l.user_id=v_user_id;

  insert into public.student_user_badges(user_id,badge_id)
  select v_user_id,b.id from public.student_badge_definitions b
  where b.active=true and b.points_threshold<=v_total_points
  on conflict(user_id,badge_id) do nothing;

  return jsonb_build_object(
    'week_start',v_week_start::date,
    'total_points',v_total_points,
    'challenges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'title',c.title,'description',c.description,'activity_type',c.activity_type,
        'target_count',c.target_count,'points',c.points,'progress_count',coalesce(p.progress_count,0),
        'completed',(l.id is not null),'points_earned',coalesce(l.points,0),'completed_at',l.awarded_at
      ) order by c.id)
      from public.student_challenges c
      left join public.student_challenge_progress p
        on p.challenge_id=c.id and p.user_id=v_user_id and p.period_start=v_week_start::date
      left join public.student_points_ledger l
        on l.challenge_id=c.id and l.user_id=v_user_id and l.period_start=v_week_start::date
      where c.active=true
    ),'[]'::jsonb),
    'badges',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'name',b.name,'description',b.description,'icon',b.icon,
        'points_threshold',b.points_threshold,'earned',(ub.user_id is not null),'earned_at',ub.earned_at
      ) order by b.points_threshold)
      from public.student_badge_definitions b
      left join public.student_user_badges ub on ub.badge_id=b.id and ub.user_id=v_user_id
      where b.active=true
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function private.get_my_student_rewards_impl() from public,anon;
grant execute on function private.get_my_student_rewards_impl() to authenticated;
commit;