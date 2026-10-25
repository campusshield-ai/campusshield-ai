-- CampusShield AI: university-scoped live student chat.
-- Additive migration. Private incident reporting and production are untouched.

begin;

create table if not exists public.campus_chat_messages (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  channel text not null default 'general'
    check (channel in ('general', 'study_help', 'campus_life', 'marketplace')),
  body text not null
    check (char_length(btrim(body)) between 1 and 1200),
  status text not null default 'published'
    check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_chat_messages_university_channel_created_idx
  on public.campus_chat_messages (university_id, channel, created_at desc);
create index if not exists campus_chat_messages_author_created_idx
  on public.campus_chat_messages (author_id, created_at desc);

alter table public.campus_chat_messages enable row level security;
revoke all on table public.campus_chat_messages from anon, authenticated;
grant select (id, university_id, author_username, channel, body, status, created_at, updated_at)
  on table public.campus_chat_messages to authenticated;

drop policy if exists campus_chat_messages_read_same_campus on public.campus_chat_messages;
create policy campus_chat_messages_read_same_campus
  on public.campus_chat_messages for select to authenticated
  using (
    university_id = (select private.current_campus_university_id())
    and (status = 'published'
      or (select private.current_campus_role()) = any (array['admin','security','teacher']))
    and (select private.current_user_has_verified_campus_access())
  );

create table if not exists public.campus_chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.campus_chat_messages(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null
    check (reason in ('spam','harassment','personal_information','threats','other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending'
    check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index if not exists campus_chat_message_reports_university_status_idx
  on public.campus_chat_message_reports (university_id, status, created_at desc);

alter table public.campus_chat_message_reports enable row level security;
revoke all on table public.campus_chat_message_reports from anon, authenticated;
grant select (id, message_id, university_id, reason, details, status, created_at)
  on table public.campus_chat_message_reports to authenticated;

drop policy if exists campus_chat_reports_read_same_campus_staff on public.campus_chat_message_reports;
create policy campus_chat_reports_read_same_campus_staff
  on public.campus_chat_message_reports for select to authenticated
  using (
    university_id = (select private.current_campus_university_id())
    and (select private.current_campus_role()) = any (array['admin','security','teacher'])
    and (select private.current_user_has_verified_campus_access())
  );

create or replace function public.send_campus_chat_message(
  p_channel text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_username text;
  v_message_id uuid;
  v_recent_count integer;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user_id is null then
    raise exception 'Sign in before joining Campus Chat.';
  end if;

  if not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verify your CampusShield account and university membership before chatting.';
  end if;

  if v_university_id is null then
    raise exception 'Choose your university before joining Campus Chat.';
  end if;

  if p_channel is null or p_channel not in ('general','study_help','campus_life','marketplace') then
    raise exception 'Choose a valid campus chat channel.';
  end if;

  if char_length(v_body) not between 1 and 1200 then
    raise exception 'Messages must be between 1 and 1200 characters.';
  end if;

  select count(*)::integer into v_recent_count
  from public.campus_chat_messages m
  where m.author_id = v_user_id
    and m.created_at > now() - interval '1 minute';

  if v_recent_count >= 8 then
    raise exception 'You have sent several messages recently. Please wait a minute before sending more.';
  end if;

  select cp.username into v_username
  from public.community_profiles cp
  where cp.user_id = v_user_id;

  if v_username is null then
    raise exception 'Your campus username is not ready yet. Refresh and try again.';
  end if;

  insert into public.campus_chat_messages
    (university_id, author_id, author_username, channel, body)
  values (v_university_id, v_user_id, v_username, p_channel, v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

revoke all on function public.send_campus_chat_message(text,text) from public, anon, authenticated;
grant execute on function public.send_campus_chat_message(text,text) to authenticated;

create or replace function public.report_campus_chat_message(
  p_message_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_author_id uuid;
  v_report_id uuid;
  v_details text := nullif(btrim(coalesce(p_details,'')), '');
begin
  if v_user_id is null then raise exception 'Sign in before reporting a message.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required to report chat messages.';
  end if;
  if p_reason is null or p_reason not in ('spam','harassment','personal_information','threats','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'Report details must be 500 characters or fewer.';
  end if;

  select m.author_id into v_author_id
  from public.campus_chat_messages m
  where m.id = p_message_id
    and m.university_id = v_university_id
    and m.status = 'published';

  if not found then raise exception 'This message is no longer available to report.'; end if;
  if v_author_id = v_user_id then raise exception 'You cannot report your own message.'; end if;

  insert into public.campus_chat_message_reports
    (message_id, university_id, reporter_id, reason, details)
  values (p_message_id, v_university_id, v_user_id, p_reason, v_details)
  returning id into v_report_id;

  return v_report_id;
exception when unique_violation then
  raise exception 'You have already reported this message.';
end;
$function$;

revoke all on function public.report_campus_chat_message(uuid,text,text) from public, anon, authenticated;
grant execute on function public.report_campus_chat_message(uuid,text,text) to authenticated;

create or replace function public.moderate_campus_chat_message(
  p_message_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if auth.uid() is null then raise exception 'Sign in before moderating chat.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()), false)
     or coalesce((select private.current_campus_role()), '') not in ('admin','security','teacher') then
    raise exception 'Only verified campus staff can moderate chat messages.';
  end if;
  if p_action is null or p_action not in ('hide','restore') then raise exception 'Choose hide or restore.'; end if;

  update public.campus_chat_messages
  set status = case when p_action = 'hide' then 'hidden' else 'published' end,
      updated_at = now()
  where id = p_message_id
    and university_id = v_university_id;

  if not found then raise exception 'This chat message was not found in your university.'; end if;
  return true;
end;
$function$;

revoke all on function public.moderate_campus_chat_message(uuid,text) from public, anon, authenticated;
grant execute on function public.moderate_campus_chat_message(uuid,text) to authenticated;

create or replace function public.review_campus_chat_report(
  p_report_id uuid,
  p_decision text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if auth.uid() is null then raise exception 'Sign in before reviewing chat reports.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()), false)
     or coalesce((select private.current_campus_role()), '') not in ('admin','security','teacher') then
    raise exception 'Only verified campus staff can review chat reports.';
  end if;
  if p_decision is null or p_decision not in ('reviewed','dismissed') then
    raise exception 'Choose reviewed or dismissed.';
  end if;

  update public.campus_chat_message_reports
  set status = p_decision
  where id = p_report_id
    and university_id = v_university_id
    and status = 'pending';

  if not found then raise exception 'This pending chat report was not found in your university.'; end if;
  return true;
end;
$function$;

revoke all on function public.review_campus_chat_report(uuid,text) from public, anon, authenticated;
grant execute on function public.review_campus_chat_report(uuid,text) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'campus_chat_messages'
     ) then
    execute 'alter publication supabase_realtime add table public.campus_chat_messages';
  end if;
end;
$publication$;

commit;
