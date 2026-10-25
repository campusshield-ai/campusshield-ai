-- CampusShield AI: student challenges, progress, points and badges.
-- Intended for the staging project first. No client can write points or award badges directly.

create table if not exists public.student_challenges (
  id text primary key,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 5 and 500),
  activity_type text not null check (activity_type in ('study_sessions','campus_contribution','course_discussion')),
  target_count integer not null check (target_count between 1 and 20),
  points integer not null check (points between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_challenge_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null references public.student_challenges(id) on delete cascade,
  period_start date not null,
  progress_count integer not null default 0 check (progress_count >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_id, period_start)
);

create table if not exists public.student_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null references public.student_challenges(id) on delete restrict,
  period_start date not null,
  points integer not null check (points between 1 and 100),
  awarded_at timestamptz not null default now(),
  unique (user_id, challenge_id, period_start)
);

create table if not exists public.student_badge_definitions (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null check (char_length(btrim(description)) between 5 and 300),
  icon text not null check (char_length(icon) between 1 and 12),
  points_threshold integer not null check (points_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.student_badge_definitions(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists student_challenge_progress_user_period_idx
  on public.student_challenge_progress (user_id, period_start desc);
create index if not exists student_points_ledger_user_awarded_idx
  on public.student_points_ledger (user_id, awarded_at desc);

alter table public.student_challenges enable row level security;
alter table public.student_challenge_progress enable row level security;
alter table public.student_points_ledger enable row level security;
alter table public.student_badge_definitions enable row level security;
alter table public.student_user_badges enable row level security;

drop policy if exists student_challenges_read_active on public.student_challenges;
create policy student_challenges_read_active on public.student_challenges
  for select to authenticated using (active = true);

drop policy if exists student_challenge_progress_read_own on public.student_challenge_progress;
create policy student_challenge_progress_read_own on public.student_challenge_progress
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists student_points_ledger_read_own on public.student_points_ledger;
create policy student_points_ledger_read_own on public.student_points_ledger
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists student_badge_definitions_read_active on public.student_badge_definitions;
create policy student_badge_definitions_read_active on public.student_badge_definitions
  for select to authenticated using (active = true);

drop policy if exists student_user_badges_read_own on public.student_user_badges;
create policy student_user_badges_read_own on public.student_user_badges
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.student_challenges, public.student_challenge_progress,
  public.student_points_ledger, public.student_badge_definitions, public.student_user_badges
  from anon, authenticated;
grant select on table public.student_challenges, public.student_challenge_progress,
  public.student_points_ledger, public.student_badge_definitions, public.student_user_badges
  to authenticated;

insert into public.student_challenges (id, title, description, activity_type, target_count, points)
values
  ('study_sessions_weekly', 'Complete three study sessions', 'Mark three revision sessions complete in your private timetable this week.', 'study_sessions', 3, 30),
  ('campus_contribution_weekly', 'Share a helpful campus post', 'Publish a constructive question, campus update, or suggestion in CampusPulse.', 'campus_contribution', 1, 20),
  ('course_discussion_weekly', 'Join a course conversation', 'Contribute three messages to an approved course community you belong to.', 'course_discussion', 3, 25)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  activity_type = excluded.activity_type,
  target_count = excluded.target_count,
  points = excluded.points,
  updated_at = now();

insert into public.student_badge_definitions (id, name, description, icon, points_threshold)
values
  ('first_steps', 'First Steps', 'Earn your first 25 community and learning points.', '🌱', 25),
  ('steady_learner', 'Steady Learner', 'Build consistency and earn 75 points.', '📚', 75),
  ('campus_helper', 'Campus Helper', 'Earn 150 points through positive student activity.', '💚', 150)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  points_threshold = excluded.points_threshold,
  active = true;

create or replace function public.get_my_student_rewards()
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
  if v_user_id is null then
    raise exception 'Sign in to view your student rewards.';
  end if;

  for v_challenge in
    select c.id, c.activity_type, c.target_count, c.points
    from public.student_challenges c
    where c.active = true
    order by c.id
  loop
    v_activity_count := 0;

    if v_challenge.activity_type = 'study_sessions' then
      select count(*)::integer into v_activity_count
      from public.shieldmind_planner_items p
      where p.user_id = v_user_id
        and p.kind = 'revision'
        and p.completed = true
        and p.updated_at >= v_week_start
        and p.updated_at < v_week_start + interval '7 days';
    elsif v_challenge.activity_type = 'campus_contribution' then
      if v_university_id is not null then
        select count(*)::integer into v_activity_count
        from public.community_posts p
        where p.author_id = v_user_id
          and p.university_id = v_university_id
          and p.status = 'published'
          and p.post_type in ('suggestion','campus_update','question')
          and p.created_at >= v_week_start
          and p.created_at < v_week_start + interval '7 days';
      end if;
    elsif v_challenge.activity_type = 'course_discussion' then
      if v_university_id is not null then
        select count(*)::integer into v_activity_count
        from public.campus_course_community_messages m
        where m.author_id = v_user_id
          and m.university_id = v_university_id
          and m.status = 'published'
          and m.created_at >= v_week_start
          and m.created_at < v_week_start + interval '7 days';
      end if;
    end if;

    insert into public.student_challenge_progress
      (user_id, challenge_id, period_start, progress_count, completed_at, updated_at)
    values
      (v_user_id, v_challenge.id, v_week_start::date,
       least(v_activity_count, v_challenge.target_count),
       case when v_activity_count >= v_challenge.target_count then now() else null end,
       now())
    on conflict (user_id, challenge_id, period_start) do update set
      progress_count = excluded.progress_count,
      completed_at = case
        when excluded.progress_count >= v_challenge.target_count
          then coalesce(public.student_challenge_progress.completed_at, now())
        else null
      end,
      updated_at = now();

    if v_activity_count >= v_challenge.target_count then
      insert into public.student_points_ledger (user_id, challenge_id, period_start, points)
      values (v_user_id, v_challenge.id, v_week_start::date, v_challenge.points)
      on conflict (user_id, challenge_id, period_start) do nothing;
    end if;
  end loop;

  select coalesce(sum(l.points), 0)::integer into v_total_points
  from public.student_points_ledger l
  where l.user_id = v_user_id;

  insert into public.student_user_badges (user_id, badge_id)
  select v_user_id, b.id
  from public.student_badge_definitions b
  where b.active = true and b.points_threshold <= v_total_points
  on conflict (user_id, badge_id) do nothing;

  return jsonb_build_object(
    'week_start', v_week_start::date,
    'total_points', v_total_points,
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'description', c.description,
        'activity_type', c.activity_type,
        'target_count', c.target_count,
        'points', c.points,
        'progress_count', coalesce(p.progress_count, 0),
        'completed', (l.id is not null),
        'points_earned', coalesce(l.points, 0),
        'completed_at', l.awarded_at
      ) order by c.id)
      from public.student_challenges c
      left join public.student_challenge_progress p
        on p.challenge_id = c.id
       and p.user_id = v_user_id
       and p.period_start = v_week_start::date
      left join public.student_points_ledger l
        on l.challenge_id = c.id
       and l.user_id = v_user_id
       and l.period_start = v_week_start::date
      where c.active = true
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'description', b.description,
        'icon', b.icon,
        'points_threshold', b.points_threshold,
        'earned', (ub.user_id is not null),
        'earned_at', ub.earned_at
      ) order by b.points_threshold)
      from public.student_badge_definitions b
      left join public.student_user_badges ub
        on ub.badge_id = b.id and ub.user_id = v_user_id
      where b.active = true
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_student_rewards() from public, anon;
grant execute on function public.get_my_student_rewards() to authenticated;
