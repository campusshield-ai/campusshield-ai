-- CampusShield AI: university-scoped Helpdesk tickets and verified noticeboard.
-- Apply to staging first. No incident tables or identity-verification rules are changed.

create table if not exists public.campus_helpdesk_tickets (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'CSH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_username text not null default 'campus member',
  category text not null check (category in (
    'facilities','hostel','wifi_it','classroom_equipment',
    'academic_service','administration','accessibility','other'
  )),
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  location text check (location is null or char_length(btrim(location)) <= 180),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'submitted' check (status in (
    'submitted','assigned','in_progress','waiting_student','resolved','closed'
  )),
  assigned_department text check (assigned_department is null or char_length(btrim(assigned_department)) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists campus_helpdesk_tickets_campus_status_created_idx
  on public.campus_helpdesk_tickets (university_id, status, created_at desc);
create index if not exists campus_helpdesk_tickets_requester_created_idx
  on public.campus_helpdesk_tickets (created_by, created_at desc);

create table if not exists public.campus_helpdesk_ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.campus_helpdesk_tickets(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_label text not null default 'Campus member',
  message text not null check (char_length(btrim(message)) between 2 and 1200),
  from_status text,
  to_status text,
  department_to text,
  created_at timestamptz not null default now()
);

create index if not exists campus_helpdesk_updates_ticket_created_idx
  on public.campus_helpdesk_ticket_updates (ticket_id, created_at asc);

alter table public.campus_helpdesk_tickets enable row level security;
alter table public.campus_helpdesk_ticket_updates enable row level security;

drop policy if exists campus_helpdesk_tickets_read_owner_or_verified_campus_staff
  on public.campus_helpdesk_tickets;
create policy campus_helpdesk_tickets_read_owner_or_verified_campus_staff
on public.campus_helpdesk_tickets
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (
    created_by = (select auth.uid())
    or coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
  )
);

drop policy if exists campus_helpdesk_updates_read_ticket_owner_or_staff
  on public.campus_helpdesk_ticket_updates;
create policy campus_helpdesk_updates_read_ticket_owner_or_staff
on public.campus_helpdesk_ticket_updates
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and exists (
    select 1
    from public.campus_helpdesk_tickets t
    where t.id = campus_helpdesk_ticket_updates.ticket_id
      and t.university_id = campus_helpdesk_ticket_updates.university_id
      and (
        t.created_by = (select auth.uid())
        or coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
      )
  )
);

revoke all on public.campus_helpdesk_tickets from anon, authenticated;
grant select on public.campus_helpdesk_tickets to authenticated;
revoke all on public.campus_helpdesk_ticket_updates from anon, authenticated;
grant select on public.campus_helpdesk_ticket_updates to authenticated;

create table if not exists public.campus_notices (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  publisher_label text not null check (char_length(btrim(publisher_label)) between 2 and 100),
  title text not null check (char_length(btrim(title)) between 4 and 140),
  body text not null check (char_length(btrim(body)) between 10 and 5000),
  category text not null check (category in (
    'announcement','academic','registration','fees','facilities',
    'closure','events','safety','it_service','other'
  )),
  audience_scope text not null default 'campus'
    check (audience_scope in ('campus','faculty','department')),
  target_faculty text,
  target_department text,
  status text not null default 'published' check (status in ('published','archived')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (expires_at is null or expires_at > published_at),
  check (
    (audience_scope = 'campus' and target_faculty is null and target_department is null)
    or (audience_scope = 'faculty' and nullif(btrim(target_faculty), '') is not null and target_department is null)
    or (audience_scope = 'department' and nullif(btrim(target_faculty), '') is not null and nullif(btrim(target_department), '') is not null)
  )
);

create index if not exists campus_notices_campus_published_idx
  on public.campus_notices (university_id, published_at desc)
  where status = 'published';

alter table public.campus_notices enable row level security;

drop policy if exists campus_notices_read_published_for_campus_audience
  on public.campus_notices;
create policy campus_notices_read_published_for_campus_audience
on public.campus_notices
for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and status = 'published'
  and (expires_at is null or expires_at > now())
  and (
    coalesce((select private.current_campus_role()), '') in ('admin','security','teacher')
    or exists (
      select 1
      from public.campus_memberships cm
      where cm.user_id = (select auth.uid())
        and cm.university_id = campus_notices.university_id
        and cm.membership_status = 'active'
        and (
          campus_notices.audience_scope = 'campus'
          or (
            campus_notices.audience_scope = 'faculty'
            and cm.faculty = campus_notices.target_faculty
          )
          or (
            campus_notices.audience_scope = 'department'
            and cm.faculty = campus_notices.target_faculty
            and cm.department = campus_notices.target_department
          )
        )
    )
  )
);

revoke all on public.campus_notices from anon, authenticated;
grant select on public.campus_notices to authenticated;

create or replace function public.submit_campus_helpdesk_ticket(
  p_category text,
  p_title text,
  p_description text,
  p_location text,
  p_priority text default 'normal'
)
returns table(ticket_id uuid, reference_code text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_ticket_id uuid;
  v_reference_code text;
begin
  if v_user_id is null then raise exception 'Sign in before submitting a campus service request.'; end if;
  if v_university_id is null then raise exception 'Choose your university before submitting a request.'; end if;
  if coalesce((select private.current_campus_account_status()), '') not in ('pending','verified') then
    raise exception 'Your account is not eligible to submit campus requests.';
  end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id and cm.university_id = v_university_id
      and cm.membership_status = 'active'
  ) then raise exception 'An active membership in this university is required.'; end if;
  if p_category not in ('facilities','hostel','wifi_it','classroom_equipment','academic_service','administration','accessibility','other') then
    raise exception 'Choose a valid service category.';
  end if;
  if p_priority not in ('low','normal','high') then raise exception 'Choose a valid priority.'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 4 and 120 then raise exception 'Title must be 4–120 characters.'; end if;
  if char_length(btrim(coalesce(p_description,''))) not between 10 and 3000 then raise exception 'Description must be 10–3000 characters.'; end if;
  if char_length(btrim(coalesce(p_location,''))) > 180 then raise exception 'Location must be 180 characters or fewer.'; end if;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;

  insert into public.campus_helpdesk_tickets
    (university_id, created_by, created_by_username, category, title, description, location, priority)
  values
    (v_university_id, v_user_id, coalesce(v_username,'campus member'), p_category,
     btrim(p_title), btrim(p_description), nullif(btrim(coalesce(p_location,'')),''), p_priority)
  returning id, campus_helpdesk_tickets.reference_code into v_ticket_id, v_reference_code;

  insert into public.campus_helpdesk_ticket_updates
    (ticket_id, university_id, author_id, author_label, message, from_status, to_status)
  values
    (v_ticket_id, v_university_id, v_user_id, coalesce('@' || v_username,'Campus member'),
     'Request submitted. The campus team can now review and assign this request.', null, 'submitted');

  return query select v_ticket_id, v_reference_code;
end;
$function$;

create or replace function public.update_campus_helpdesk_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_assigned_department text default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
  v_is_staff boolean := false;
  v_ticket public.campus_helpdesk_tickets%rowtype;
  v_new_status text;
  v_new_department text;
  v_message text := btrim(coalesce(p_message,''));
  v_username text;
  v_author_label text;
begin
  if v_user_id is null then raise exception 'Sign in to update a campus service request.'; end if;
  if v_university_id is null then raise exception 'Choose your university first.'; end if;
  v_is_staff := v_role in ('admin','security','teacher');

  select t.* into v_ticket
  from public.campus_helpdesk_tickets t
  where t.id = p_ticket_id and t.university_id = v_university_id;
  if not found then raise exception 'This request is not available in your university.'; end if;

  if v_ticket.created_by <> v_user_id and not v_is_staff then
    raise exception 'Only the requester or verified campus staff can update this request.';
  end if;
  if v_message <> '' and char_length(v_message) > 1200 then
    raise exception 'Updates must be 1200 characters or fewer.';
  end if;

  v_new_status := v_ticket.status;
  v_new_department := v_ticket.assigned_department;

  if v_is_staff then
    if p_status is not null then
      if p_status not in ('submitted','assigned','in_progress','waiting_student','resolved','closed') then
        raise exception 'Choose a valid request status.';
      end if;
      v_new_status := p_status;
    end if;
    if p_assigned_department is not null then
      if char_length(btrim(p_assigned_department)) > 100 then raise exception 'Department must be 100 characters or fewer.'; end if;
      v_new_department := nullif(btrim(p_assigned_department),'');
    end if;
  else
    if p_status is not null or p_assigned_department is not null then
      raise exception 'Students can add a message but cannot change request status or assignment.';
    end if;
    if v_ticket.status in ('resolved','closed') then
      raise exception 'This request is closed. Contact your campus service team to reopen it.';
    end if;
  end if;

  if v_message = '' and v_new_status = v_ticket.status and v_new_department is not distinct from v_ticket.assigned_department then
    raise exception 'Add an update message or change the status/department.';
  end if;

  if v_message = '' then
    if v_new_status <> v_ticket.status then
      v_message := 'Status updated to ' || replace(v_new_status,'_',' ') || '.';
    else
      v_message := 'Assigned department updated' || case when v_new_department is null then ' and assignment cleared.' else ' to ' || v_new_department || '.' end;
    end if;
  end if;

  update public.campus_helpdesk_tickets
  set status = v_new_status,
      assigned_department = v_new_department,
      updated_at = now(),
      closed_at = case when v_new_status in ('resolved','closed') then coalesce(closed_at,now()) else null end
  where id = v_ticket.id;

  select cp.username into v_username from public.community_profiles cp where cp.user_id = v_user_id;
  v_author_label := case when v_username is not null then '@' || v_username else case when v_is_staff then 'Verified campus staff' else 'Campus member' end end;

  insert into public.campus_helpdesk_ticket_updates
    (ticket_id, university_id, author_id, author_label, message, from_status, to_status, department_to)
  values
    (v_ticket.id, v_university_id, v_user_id, v_author_label, v_message,
     v_ticket.status, v_new_status, v_new_department);
end;
$function$;

create or replace function public.publish_campus_notice(
  p_publisher_label text,
  p_title text,
  p_body text,
  p_category text,
  p_audience_scope text default 'campus',
  p_target_faculty text default null,
  p_target_department text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
  v_notice_id uuid;
  v_scope text := coalesce(p_audience_scope,'campus');
  v_faculty text := nullif(btrim(coalesce(p_target_faculty,'')),'');
  v_department text := nullif(btrim(coalesce(p_target_department,'')),'');
  v_label text := btrim(coalesce(p_publisher_label,''));
begin
  if v_user_id is null then raise exception 'Sign in before publishing a campus notice.'; end if;
  if v_university_id is null then raise exception 'Choose your university first.'; end if;
  if v_role not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required to publish official notices.';
  end if;
  if char_length(v_label) not between 2 and 100 then raise exception 'Enter a department or official unit label (2–100 characters).'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 4 and 140 then raise exception 'Notice title must be 4–140 characters.'; end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 5000 then raise exception 'Notice body must be 10–5000 characters.'; end if;
  if p_category not in ('announcement','academic','registration','fees','facilities','closure','events','safety','it_service','other') then
    raise exception 'Choose a valid notice category.';
  end if;
  if v_scope not in ('campus','faculty','department') then raise exception 'Choose a valid notice audience.'; end if;
  if v_scope = 'campus' then
    v_faculty := null; v_department := null;
  elsif v_scope = 'faculty' then
    if v_faculty is null then raise exception 'Choose a faculty for this notice.'; end if;
    v_department := null;
  else
    if v_faculty is null or v_department is null then raise exception 'Choose both a faculty and department for this notice.'; end if;
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Expiry must be in the future.'; end if;

  insert into public.campus_notices
    (university_id, created_by, publisher_label, title, body, category, audience_scope,
     target_faculty, target_department, status, published_at, expires_at)
  values
    (v_university_id, v_user_id, v_label, btrim(p_title), btrim(p_body), p_category,
     v_scope, v_faculty, v_department, 'published', now(), p_expires_at)
  returning id into v_notice_id;

  return v_notice_id;
end;
$function$;

create or replace function public.archive_campus_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
begin
  if v_user_id is null then raise exception 'Sign in to archive a notice.'; end if;
  if v_role not in ('admin','security','teacher') then raise exception 'Verified campus staff membership is required.'; end if;
  update public.campus_notices
    set status='archived', archived_at=now()
    where id=p_notice_id and university_id=v_university_id and status='published';
  if not found then raise exception 'This notice is not active in your university.'; end if;
end;
$function$;

revoke all on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) from public, anon;
grant execute on function public.submit_campus_helpdesk_ticket(text,text,text,text,text) to authenticated;
revoke all on function public.update_campus_helpdesk_ticket(uuid,text,text,text) from public, anon;
grant execute on function public.update_campus_helpdesk_ticket(uuid,text,text,text) to authenticated;
revoke all on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.publish_campus_notice(text,text,text,text,text,text,text,timestamptz) to authenticated;
revoke all on function public.archive_campus_notice(uuid) from public, anon;
grant execute on function public.archive_campus_notice(uuid) to authenticated;
