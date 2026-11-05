-- Student-led Ideas & Impact board for verified campus members.
-- Proposals remain private to the submitter and campus moderators until approved.
create table public.campus_ideas (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  category text not null check (category in (
    'campus_facilities','learning_research','student_wellbeing','environment',
    'technology_innovation','community_world','accessibility','safety'
  )),
  impact_scope text not null check (impact_scope in ('campus','local_community','national','global')),
  problem_statement text not null check (char_length(btrim(problem_statement)) between 20 and 1800),
  proposed_solution text not null check (char_length(btrim(proposed_solution)) between 20 and 1800),
  expected_impact text not null check (char_length(btrim(expected_impact)) between 10 and 800),
  status text not null default 'pending' check (status in (
    'pending','published','planned','in_progress','implemented','declined'
  )),
  support_count integer not null default 0 check (support_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, university_id)
);

create index campus_ideas_campus_status_created_idx
  on public.campus_ideas (university_id, status, created_at desc);
create index campus_ideas_campus_category_status_idx
  on public.campus_ideas (university_id, category, status, created_at desc);

create table public.campus_idea_supports (
  idea_id uuid not null references public.campus_ideas(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create table public.campus_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.campus_ideas(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_username text not null,
  body text not null check (char_length(btrim(body)) between 3 and 700),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campus_idea_comments_idea_created_idx
  on public.campus_idea_comments (idea_id, created_at asc);

create table public.campus_idea_status_updates (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.campus_ideas(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status text not null check (status in ('published','planned','in_progress','implemented','declined')),
  note text check (note is null or char_length(btrim(note)) <= 700),
  created_at timestamptz not null default now()
);
create index campus_idea_status_updates_idea_created_idx
  on public.campus_idea_status_updates (idea_id, created_at desc);

-- Keep ownership, username and campus derived from the authenticated session.
create or replace function private.prepare_campus_idea_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
     or not private.current_user_has_verified_campus_access() then
    raise exception 'Verified campus membership is required.';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := (select auth.uid());
    new.university_id := private.current_campus_university_id();
    if new.university_id is null then
      raise exception 'Choose your university first.';
    end if;

    select cp.username
      into new.creator_username
      from public.community_profiles cp
     where cp.user_id = (select auth.uid());

    if new.creator_username is null then
      raise exception 'Set up your CampusPulse username before sharing an idea.';
    end if;
    new.created_at := now();
  else
    if new.user_id is distinct from old.user_id
       or new.university_id is distinct from old.university_id
       or new.creator_username is distinct from old.creator_username then
      raise exception 'Idea ownership and campus cannot be changed.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger campus_ideas_prepare_item
before insert or update on public.campus_ideas
for each row execute function private.prepare_campus_idea_item();

create trigger campus_idea_comments_prepare_item
before insert or update on public.campus_idea_comments
for each row execute function private.prepare_campus_idea_item();

-- This trigger maintains a non-user-editable support count for fast feed rendering.
create or replace function private.adjust_campus_idea_support_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    update public.campus_ideas
       set support_count = support_count + 1,
           updated_at = now()
     where id = new.idea_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.campus_ideas
       set support_count = greatest(0, support_count - 1),
           updated_at = now()
     where id = old.idea_id;
    return old;
  end if;
  return null;
end;
$function$;
revoke all on function private.adjust_campus_idea_support_count() from public, anon, authenticated;

create trigger campus_idea_support_count
after insert or delete on public.campus_idea_supports
for each row execute function private.adjust_campus_idea_support_count();

-- Status changes are appended by verified campus staff. This private trigger
-- applies only validated review-history inserts to the parent idea.
create or replace function private.apply_campus_idea_status_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_status text;
begin
  select i.status
    into v_current_status
    from public.campus_ideas i
   where i.id = new.idea_id
     and i.university_id = new.university_id
   for update;

  if v_current_status is null then
    raise exception 'The idea is not available in this campus.';
  end if;

  if v_current_status = 'pending' and new.status not in ('published','declined') then
    raise exception 'A pending idea must first be published or declined.';
  elsif v_current_status = 'published' and new.status not in ('planned','in_progress','implemented','declined') then
    raise exception 'Choose a valid next step for this published idea.';
  elsif v_current_status = 'planned' and new.status not in ('in_progress','implemented','declined') then
    raise exception 'A planned idea can move to in progress, implemented or declined.';
  elsif v_current_status = 'in_progress' and new.status not in ('planned','implemented','declined') then
    raise exception 'An in-progress idea can move to planned, implemented or declined.';
  elsif v_current_status = 'implemented' then
    raise exception 'An implemented idea is complete and cannot be changed.';
  elsif v_current_status = 'declined' and new.status <> 'published' then
    raise exception 'A declined idea can only be reopened for publication.';
  end if;

  update public.campus_ideas
     set status = new.status,
         updated_at = now()
   where id = new.idea_id
     and university_id = new.university_id;

  return new;
end;
$function$;
revoke all on function private.apply_campus_idea_status_update() from public, anon, authenticated;

create trigger campus_idea_apply_status_update
after insert on public.campus_idea_status_updates
for each row execute function private.apply_campus_idea_status_update();

alter table public.campus_ideas enable row level security;
alter table public.campus_idea_supports enable row level security;
alter table public.campus_idea_comments enable row level security;
alter table public.campus_idea_status_updates enable row level security;

create policy campus_ideas_read_verified_campus
on public.campus_ideas for select to authenticated
using (
  private.current_user_has_verified_campus_access()
  and university_id = private.current_campus_university_id()
  and (
    status in ('published','planned','in_progress','implemented')
    or user_id = (select auth.uid())
    or private.current_campus_role() in ('admin','security','teacher')
  )
);

create policy campus_ideas_insert_own_pending
on public.campus_ideas for insert to authenticated
with check (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and status = 'pending'
  and support_count = 0
  and private.current_user_has_verified_campus_access()
);

create policy campus_ideas_update_own_pending
on public.campus_ideas for update to authenticated
using (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and status = 'pending'
  and private.current_user_has_verified_campus_access()
)
with check (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and status = 'pending'
  and private.current_user_has_verified_campus_access()
);

create policy campus_ideas_delete_own_pending
on public.campus_ideas for delete to authenticated
using (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and status = 'pending'
  and private.current_user_has_verified_campus_access()
);

create policy campus_idea_supports_read_own
on public.campus_idea_supports for select to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_supports.idea_id
       and i.university_id = private.current_campus_university_id()
       and i.status in ('published','planned','in_progress','implemented')
  )
);

create policy campus_idea_supports_insert_other_published
on public.campus_idea_supports for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_supports.idea_id
       and i.university_id = private.current_campus_university_id()
       and i.status in ('published','planned','in_progress','implemented')
       and i.user_id <> (select auth.uid())
  )
);

create policy campus_idea_supports_delete_own
on public.campus_idea_supports for delete to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_supports.idea_id
       and i.university_id = private.current_campus_university_id()
  )
);

create policy campus_idea_comments_read_published_ideas
on public.campus_idea_comments for select to authenticated
using (
  private.current_user_has_verified_campus_access()
  and university_id = private.current_campus_university_id()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_comments.idea_id
       and i.university_id = campus_idea_comments.university_id
       and i.status in ('published','planned','in_progress','implemented')
  )
);

create policy campus_idea_comments_insert_published_ideas
on public.campus_idea_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_comments.idea_id
       and i.university_id = campus_idea_comments.university_id
       and i.status in ('published','planned','in_progress','implemented')
  )
);

create policy campus_idea_comments_delete_own
on public.campus_idea_comments for delete to authenticated
using (
  user_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and private.current_user_has_verified_campus_access()
);

create policy campus_idea_status_updates_read_visible_ideas
on public.campus_idea_status_updates for select to authenticated
using (
  private.current_user_has_verified_campus_access()
  and university_id = private.current_campus_university_id()
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_status_updates.idea_id
       and i.university_id = campus_idea_status_updates.university_id
       and (
         i.status in ('published','planned','in_progress','implemented')
         or i.user_id = (select auth.uid())
         or private.current_campus_role() in ('admin','security','teacher')
       )
  )
);

create policy campus_idea_status_updates_insert_verified_staff
on public.campus_idea_status_updates for insert to authenticated
with check (
  reviewer_id = (select auth.uid())
  and university_id = private.current_campus_university_id()
  and private.current_user_has_verified_campus_access()
  and private.current_campus_role() in ('admin','security','teacher')
  and exists (
    select 1 from public.campus_ideas i
     where i.id = campus_idea_status_updates.idea_id
       and i.university_id = campus_idea_status_updates.university_id
  )
);

revoke all on table public.campus_ideas, public.campus_idea_supports,
  public.campus_idea_comments, public.campus_idea_status_updates
  from public, anon, authenticated;

grant select, insert, delete on table public.campus_ideas to authenticated;
grant update (title, category, impact_scope, problem_statement, proposed_solution, expected_impact)
  on table public.campus_ideas to authenticated;
grant select, insert, delete on table public.campus_idea_supports to authenticated;
grant select, insert, delete on table public.campus_idea_comments to authenticated;
grant select, insert on table public.campus_idea_status_updates to authenticated;

revoke all on function private.prepare_campus_idea_item() from public, anon, authenticated;

comment on table public.campus_ideas is
  'Student improvement proposals, visible only to verified members of the same university after campus review.';
comment on table public.campus_idea_supports is
  'One support vote per verified campus member and idea; support_count is maintained by a private database trigger.';
comment on table public.campus_idea_comments is
  'Campus-scoped discussion on published student ideas.';
comment on table public.campus_idea_status_updates is
  'Append-only campus staff decisions and progress updates for student ideas.';
