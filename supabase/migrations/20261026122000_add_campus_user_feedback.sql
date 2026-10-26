-- CampusShield AI: private help & feedback intake with campus-scoped administrator triage.
-- Applied first to staging. Production rollout requires a separate migration review.
begin;

create table if not exists public.campus_user_feedback (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique
    default ('CSFB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid references public.campus_universities(id) on delete set null,
  kind text not null check (kind in ('problem', 'improvement')),
  category text not null check (char_length(btrim(category)) between 2 and 60),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  steps_to_reproduce text check (steps_to_reproduce is null or char_length(steps_to_reproduce) <= 3000),
  expected_behavior text check (expected_behavior is null or char_length(expected_behavior) <= 2000),
  impact text not null default 'normal' check (impact in ('low','normal','high','critical')),
  status text not null default 'submitted'
    check (status in ('submitted','triaged','in_progress','planned','resolved','declined','duplicate')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  github_issue_url text check (
    github_issue_url is null
    or (char_length(github_issue_url) <= 500 and github_issue_url ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[0-9]+/?$')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_user_feedback_user_created_idx
  on public.campus_user_feedback (user_id, created_at desc);
create index if not exists campus_user_feedback_campus_status_created_idx
  on public.campus_user_feedback (university_id, status, created_at desc);
create index if not exists campus_user_feedback_status_priority_idx
  on public.campus_user_feedback (status, priority, created_at desc);

alter table public.campus_user_feedback enable row level security;
revoke all on table public.campus_user_feedback from public, anon, authenticated;
grant select on table public.campus_user_feedback to authenticated;

drop policy if exists campus_user_feedback_read_own_or_authorized_admin
  on public.campus_user_feedback;
create policy campus_user_feedback_read_own_or_authorized_admin
  on public.campus_user_feedback for select to authenticated
  using (
    user_id = (select auth.uid())
    or coalesce((select public.platform_is_admin()), false)
    or (
      exists (
        select 1
        from public.profiles actor
        where actor.id = (select auth.uid())
          and actor.role = 'admin'
          and actor.verification_status = 'verified'
      )
      and university_id is not null
      and exists (
        select 1
        from public.campus_memberships cm
        where cm.user_id = (select auth.uid())
          and cm.university_id = campus_user_feedback.university_id
          and cm.membership_status = 'active'
          and cm.verification_status = 'verified'
          and cm.campus_role = 'admin'
      )
    )
  );

-- Keep staff-only notes separate: submitters can inspect their own tickets but cannot
-- read private triage notes, even if they attempt to select every column.
create table if not exists public.campus_user_feedback_admin_notes (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.campus_user_feedback(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists campus_user_feedback_admin_notes_feedback_created_idx
  on public.campus_user_feedback_admin_notes (feedback_id, created_at desc);
alter table public.campus_user_feedback_admin_notes enable row level security;
revoke all on table public.campus_user_feedback_admin_notes from public, anon, authenticated;

create or replace function public.submit_campus_feedback(
  p_university_id uuid,
  p_kind text,
  p_category text,
  p_title text,
  p_description text,
  p_steps_to_reproduce text default null,
  p_expected_behavior text default null,
  p_impact text default 'normal'
)
returns table(id uuid, reference_code text, kind text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_category text := btrim(coalesce(p_category, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_steps text := nullif(btrim(coalesce(p_steps_to_reproduce, '')), '');
  v_expected text := nullif(btrim(coalesce(p_expected_behavior, '')), '');
  v_impact text := lower(btrim(coalesce(p_impact, 'normal')));
begin
  if v_user_id is null then
    raise exception 'Sign in to submit feedback.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    raise exception 'Your CampusShield profile is not ready yet. Please try again shortly.' using errcode = '42501';
  end if;
  if p_university_id is not null and not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id
      and cm.university_id = p_university_id
      and cm.membership_status = 'active'
  ) then
    raise exception 'The selected university is not linked to your active campus membership.' using errcode = '42501';
  end if;
  if p_kind not in ('problem','improvement') then
    raise exception 'Choose Report a Problem or Suggest an Improvement.' using errcode = '22023';
  end if;
  if char_length(v_category) not between 2 and 60 then
    raise exception 'Choose a feedback category.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 120 then
    raise exception 'The title must be between 3 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(v_description) not between 10 and 4000 then
    raise exception 'The description must be between 10 and 4000 characters.' using errcode = '22023';
  end if;
  if v_steps is not null and char_length(v_steps) > 3000 then
    raise exception 'Steps to reproduce must be 3000 characters or fewer.' using errcode = '22023';
  end if;
  if v_expected is not null and char_length(v_expected) > 2000 then
    raise exception 'Expected behavior must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  if v_impact not in ('low','normal','high','critical') then
    raise exception 'Choose a valid impact level.' using errcode = '22023';
  end if;

  return query
  insert into public.campus_user_feedback as f (
    user_id, university_id, kind, category, title, description,
    steps_to_reproduce, expected_behavior, impact
  )
  values (
    v_user_id, p_university_id, p_kind, v_category, v_title, v_description,
    v_steps, v_expected, v_impact
  )
  returning f.id, f.reference_code, f.kind, f.status, f.created_at;
end;
$function$;

create or replace function public.admin_manage_campus_feedback(
  p_feedback_id uuid,
  p_status text,
  p_priority text,
  p_assigned_to uuid default null,
  p_github_issue_url text default null,
  p_internal_note text default null
)
returns table(id uuid, reference_code text, status text, priority text, assigned_to uuid, github_issue_url text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid;
  v_is_platform_admin boolean := coalesce((select public.platform_is_admin()), false);
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_priority text := lower(btrim(coalesce(p_priority, '')));
  v_github_url text := nullif(btrim(coalesce(p_github_issue_url, '')), '');
  v_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.verification_status = 'verified'
  ) then
    raise exception 'Only verified administrators can triage feedback.' using errcode = '42501';
  end if;
  if v_status not in ('submitted','triaged','in_progress','planned','resolved','declined','duplicate') then
    raise exception 'Choose a valid feedback status.' using errcode = '22023';
  end if;
  if v_priority not in ('low','normal','high','urgent') then
    raise exception 'Choose a valid feedback priority.' using errcode = '22023';
  end if;
  if v_github_url is not null and (
    char_length(v_github_url) > 500
    or v_github_url !~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/[0-9]+/?$'
  ) then
    raise exception 'Enter a GitHub issue URL in the form https://github.com/owner/repo/issues/123.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Internal note must be 2000 characters or fewer.' using errcode = '22023';
  end if;

  select f.university_id into v_university_id
  from public.campus_user_feedback f
  where f.id = p_feedback_id
  for update;
  if not found then
    raise exception 'Feedback submission not found.' using errcode = 'P0002';
  end if;
  if v_university_id is null and not v_is_platform_admin then
    raise exception 'Only a platform administrator can triage submissions without a campus.' using errcode = '42501';
  end if;
  if v_university_id is not null and not v_is_platform_admin and not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_actor
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and cm.campus_role = 'admin'
  ) then
    raise exception 'You can manage feedback only for your verified campus.' using errcode = '42501';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_assigned_to
      and p.role in ('admin','security','teacher')
      and p.verification_status = 'verified'
  ) then
    raise exception 'The assignee must be a verified staff member.' using errcode = '22023';
  end if;
  if p_assigned_to is not null and v_university_id is not null and not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = p_assigned_to
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and cm.campus_role in ('admin','security','teacher')
  ) then
    raise exception 'Assign this item to verified staff at the same university.' using errcode = '22023';
  end if;

  return query
  update public.campus_user_feedback f
  set status = v_status,
      priority = v_priority,
      assigned_to = p_assigned_to,
      github_issue_url = v_github_url,
      updated_at = now()
  where f.id = p_feedback_id
  returning f.id, f.reference_code, f.status, f.priority, f.assigned_to, f.github_issue_url, f.updated_at;

  if v_note is not null then
    insert into public.campus_user_feedback_admin_notes (feedback_id, note, created_by)
    values (p_feedback_id, v_note, v_actor);
  end if;
end;
$function$;

create or replace function public.list_campus_feedback_admin_notes(p_feedback_id uuid)
returns table(id uuid, feedback_id uuid, note text, created_by uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid;
  v_is_platform_admin boolean := coalesce((select public.platform_is_admin()), false);
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.verification_status = 'verified'
  ) then
    raise exception 'Only verified administrators can read staff notes.' using errcode = '42501';
  end if;
  select f.university_id into v_university_id
  from public.campus_user_feedback f where f.id = p_feedback_id;
  if not found then raise exception 'Feedback submission not found.' using errcode = 'P0002'; end if;
  if v_university_id is not null and not v_is_platform_admin and not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_actor
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and cm.campus_role = 'admin'
  ) then
    raise exception 'You can read notes only for your verified campus.' using errcode = '42501';
  end if;
  return query
  select n.id, n.feedback_id, n.note, n.created_by, n.created_at
  from public.campus_user_feedback_admin_notes n
  where n.feedback_id = p_feedback_id
  order by n.created_at desc
  limit 20;
end;
$function$;

create or replace function public.list_campus_feedback_assignees(p_university_id uuid default null)
returns table(id uuid, display_name text, role text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid := p_university_id;
  v_is_platform_admin boolean := coalesce((select public.platform_is_admin()), false);
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.verification_status = 'verified'
  ) then
    raise exception 'Only verified administrators can list feedback assignees.' using errcode = '42501';
  end if;
  if v_university_id is null and not v_is_platform_admin then
    select cm.university_id into v_university_id
    from public.campus_memberships cm
    where cm.user_id = v_actor
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and cm.campus_role = 'admin'
    order by cm.updated_at desc
    limit 1;
  end if;
  if v_university_id is null and not v_is_platform_admin then
    raise exception 'Choose an active verified campus before assigning feedback.' using errcode = '42501';
  end if;
  if v_university_id is not null and not v_is_platform_admin and not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_actor
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
      and cm.verification_status = 'verified'
      and cm.campus_role = 'admin'
  ) then
    raise exception 'You can assign feedback only to verified staff at your campus.' using errcode = '42501';
  end if;
  return query
  select distinct on (p.id) p.id, coalesce(nullif(btrim(p.display_name), ''), 'Campus member'), p.role
  from public.profiles p
  join public.campus_memberships cm on cm.user_id = p.id
  where (v_university_id is null or cm.university_id = v_university_id)
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
    and cm.campus_role in ('admin','security','teacher')
    and p.verification_status = 'verified'
    and p.role in ('admin','security','teacher')
  order by p.id, p.display_name nulls last, p.role;
end;
$function$;

revoke all on function public.submit_campus_feedback(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_campus_feedback(uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.admin_manage_campus_feedback(uuid,text,text,uuid,text,text) from public, anon;
grant execute on function public.admin_manage_campus_feedback(uuid,text,text,uuid,text,text) to authenticated;
revoke all on function public.list_campus_feedback_admin_notes(uuid) from public, anon;
grant execute on function public.list_campus_feedback_admin_notes(uuid) to authenticated;

comment on table public.campus_user_feedback is
  'Private help and product feedback submissions. Users read their own rows; verified campus admins see only their campus, and platform admins can triage globally.';
comment on table public.campus_user_feedback_admin_notes is
  'Staff-only notes for campus feedback triage. No direct browser table grants; accessible only through a guarded administrator RPC.';

commit;

revoke all on function public.list_campus_feedback_assignees(uuid) from public, anon;
grant execute on function public.list_campus_feedback_assignees(uuid) to authenticated;
