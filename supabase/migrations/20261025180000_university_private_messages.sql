-- CampusShield AI: private one-to-one messaging within a university.
-- Additive migration; messages are accessible only to the two participants and campus-scoped staff moderation.

begin;

create table if not exists public.campus_direct_conversations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','blocked')),
  blocked_by uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_direct_conversations_distinct_users check (user_one_id <> user_two_id),
  constraint campus_direct_conversations_sorted_users check (user_one_id < user_two_id),
  constraint campus_direct_conversations_requester_member check (requested_by = user_one_id or requested_by = user_two_id),
  constraint campus_direct_conversations_blocker_member check (blocked_by is null or blocked_by = user_one_id or blocked_by = user_two_id),
  unique (university_id, user_one_id, user_two_id)
);

create index if not exists campus_direct_conversations_user_one_idx
  on public.campus_direct_conversations (university_id, user_one_id, last_message_at desc);
create index if not exists campus_direct_conversations_user_two_idx
  on public.campus_direct_conversations (university_id, user_two_id, last_message_at desc);

create table if not exists public.campus_direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.campus_direct_conversations(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_direct_messages_conversation_created_idx
  on public.campus_direct_messages (conversation_id, created_at asc);
create index if not exists campus_direct_messages_sender_created_idx
  on public.campus_direct_messages (sender_id, created_at desc);

create table if not exists public.campus_direct_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.campus_direct_messages(id) on delete cascade,
  conversation_id uuid not null references public.campus_direct_conversations(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','personal_information','threats','other')),
  details text check (details is null or char_length(btrim(details)) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index if not exists campus_direct_message_reports_campus_status_idx
  on public.campus_direct_message_reports (university_id, status, created_at desc);

alter table public.campus_direct_conversations enable row level security;
alter table public.campus_direct_messages enable row level security;
alter table public.campus_direct_message_reports enable row level security;

-- Explicit deny policies make the no-direct-REST-access posture visible to linter
-- tools; privileged, authorization-checked RPCs run as the table owner.
drop policy if exists campus_direct_conversations_no_direct_client_access on public.campus_direct_conversations;
create policy campus_direct_conversations_no_direct_client_access
  on public.campus_direct_conversations for all to authenticated
  using (false) with check (false);

drop policy if exists campus_direct_message_reports_no_direct_client_access on public.campus_direct_message_reports;
create policy campus_direct_message_reports_no_direct_client_access
  on public.campus_direct_message_reports for all to authenticated
  using (false) with check (false);

-- All writes go through authorization-checked RPCs. Conversations and report tables
-- are not directly exposed to the authenticated REST client.
revoke all on table public.campus_direct_conversations from anon, authenticated;
revoke all on table public.campus_direct_message_reports from anon, authenticated;
revoke all on table public.campus_direct_messages from anon, authenticated;

grant select (id, conversation_id, university_id, author_username, body, status, created_at, updated_at)
  on table public.campus_direct_messages to authenticated;

create or replace function private.can_read_campus_direct_message(
  p_conversation_id uuid,
  p_university_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select private.current_user_has_verified_campus_access()), false)
    and p_university_id = (select private.current_campus_university_id())
    and exists (
      select 1
      from public.campus_direct_conversations c
      where c.id = p_conversation_id
        and c.university_id = p_university_id
        and (c.user_one_id = (select auth.uid()) or c.user_two_id = (select auth.uid()))
        and (
          c.status = 'accepted'
          or (c.status = 'pending' and p_sender_id = c.requested_by)
        )
    );
$function$;

revoke all on function private.can_read_campus_direct_message(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function private.can_read_campus_direct_message(uuid,uuid,uuid) to authenticated;

drop policy if exists campus_direct_messages_read_participant on public.campus_direct_messages;
create policy campus_direct_messages_read_participant
  on public.campus_direct_messages for select to authenticated
  using (
    status = 'published'
    and (select private.can_read_campus_direct_message(
      conversation_id, university_id, sender_id
    ))
  );

create or replace function public.search_campus_members(p_query text)
returns table (username text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_query text := lower(btrim(coalesce(p_query,'')));
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required to find message recipients.';
  end if;
  if char_length(v_query) < 3 then
    raise exception 'Enter at least 3 characters of a campus username.';
  end if;

  return query
  select cp.username
  from public.community_profiles cp
  join public.profiles p on p.id = cp.user_id
  join public.campus_memberships cm on cm.user_id = cp.user_id
  where cp.user_id <> v_user_id
    and cm.university_id = v_university_id
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
    and p.verification_status = 'verified'
    and lower(cp.username) like v_query || '%'
    and (
      p.role <> 'student'
      or exists (
        select 1 from public.student_identity_verifications siv
        where siv.user_id = p.id and siv.status = 'approved'
      )
    )
    and not exists (
      select 1 from public.student_identity_verifications siv
      where siv.user_id = p.id and siv.confirmed_fraud = true
        and siv.fraud_lock_at is not null and now() >= siv.fraud_lock_at
    )
  order by cp.username
  limit 12;
end;
$function$;

create or replace function public.list_my_campus_direct_conversations()
returns table (
  conversation_id uuid,
  other_username text,
  status text,
  requested_by_me boolean,
  blocked_by_me boolean,
  last_message_at timestamptz,
  latest_message_preview text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required to use private messages.';
  end if;

  return query
  select c.id,
         cp.username,
         c.status,
         c.requested_by = v_user_id,
         c.blocked_by = v_user_id,
         c.last_message_at,
         case when c.status in ('pending','accepted') then (
           select left(m.body, 140)
           from public.campus_direct_messages m
           where m.conversation_id = c.id and m.status = 'published'
           order by m.created_at desc
           limit 1
         ) else null end
  from public.campus_direct_conversations c
  join public.community_profiles cp
    on cp.user_id = case when c.user_one_id = v_user_id then c.user_two_id else c.user_one_id end
  where c.university_id = v_university_id
    and (c.user_one_id = v_user_id or c.user_two_id = v_user_id)
  order by c.last_message_at desc
  limit 100;
end;
$function$;

create or replace function public.list_campus_direct_messages(p_conversation_id uuid)
returns table (
  id uuid,
  author_username text,
  body text,
  status text,
  created_at timestamptz,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_status text;
  v_requested_by uuid;
begin
  if v_user_id is null or v_university_id is null
     or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required to read private messages.';
  end if;

  select c.status, c.requested_by into v_status, v_requested_by
  from public.campus_direct_conversations c
  where c.id = p_conversation_id
    and c.university_id = v_university_id
    and (c.user_one_id = v_user_id or c.user_two_id = v_user_id);

  if not found then raise exception 'Conversation not found in your university.'; end if;
  if v_status not in ('accepted','pending') then
    raise exception 'This conversation is closed.';
  end if;

  return query
  select m.id, m.author_username, m.body, m.status, m.created_at, m.sender_id = v_user_id
  from public.campus_direct_messages m
  where m.conversation_id = p_conversation_id
    and m.university_id = v_university_id
    and m.status = 'published'
    and (v_status = 'accepted' or (v_status = 'pending' and m.sender_id = v_requested_by))
  order by m.created_at asc
  limit 200;
end;
$function$;

create or replace function public.create_campus_direct_message_request(
  p_recipient_username text,
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
  v_sender_username text;
  v_recipient_id uuid;
  v_user_one uuid;
  v_user_two uuid;
  v_conversation_id uuid;
  v_status text;
  v_requested_by uuid;
  v_recent_requests integer;
  v_recent_messages integer;
  v_body text := btrim(coalesce(p_body,''));
begin
  if v_user_id is null then raise exception 'Sign in before messaging another member.'; end if;
  if v_university_id is null or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required for private messaging.';
  end if;
  if char_length(btrim(coalesce(p_recipient_username,''))) not between 3 and 20 then
    raise exception 'Enter a valid campus username.';
  end if;
  if char_length(v_body) not between 1 and 1200 then
    raise exception 'Your introduction must be between 1 and 1200 characters.';
  end if;

  select cp.username into v_sender_username
  from public.community_profiles cp where cp.user_id = v_user_id;
  if v_sender_username is null then raise exception 'Your campus username is not ready. Refresh and try again.'; end if;

  select cp.user_id into v_recipient_id
  from public.community_profiles cp
  join public.profiles p on p.id = cp.user_id
  join public.campus_memberships cm on cm.user_id = cp.user_id
  where lower(cp.username) = lower(btrim(p_recipient_username))
    and cp.user_id <> v_user_id
    and cm.university_id = v_university_id
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
    and p.verification_status = 'verified'
    and (
      p.role <> 'student'
      or exists (
        select 1 from public.student_identity_verifications siv
        where siv.user_id = p.id and siv.status = 'approved'
      )
    )
    and not exists (
      select 1 from public.student_identity_verifications siv
      where siv.user_id = p.id and siv.confirmed_fraud = true
        and siv.fraud_lock_at is not null and now() >= siv.fraud_lock_at
    )
  limit 1;

  if v_recipient_id is null then
    raise exception 'No eligible member with that username was found at your university.';
  end if;

  select count(*)::integer into v_recent_messages
  from public.campus_direct_messages m
  where m.sender_id = v_user_id and m.created_at > now() - interval '1 minute';
  if v_recent_messages >= 12 then
    raise exception 'You are sending messages too quickly. Wait a minute before trying again.';
  end if;

  v_user_one := least(v_user_id, v_recipient_id);
  v_user_two := greatest(v_user_id, v_recipient_id);

  select c.id, c.status, c.requested_by
    into v_conversation_id, v_status, v_requested_by
  from public.campus_direct_conversations c
  where c.university_id = v_university_id
    and c.user_one_id = v_user_one and c.user_two_id = v_user_two
  for update;

  if found then
    if v_status = 'accepted' then
      insert into public.campus_direct_messages
        (conversation_id, university_id, sender_id, author_username, body)
      values (v_conversation_id, v_university_id, v_user_id, v_sender_username, v_body);
      update public.campus_direct_conversations
      set last_message_at = now(), updated_at = now()
      where id = v_conversation_id;
      return v_conversation_id;
    elsif v_status = 'pending' and v_requested_by <> v_user_id then
      raise exception 'This member already sent you a message request. Open your inbox to accept or decline it.';
    elsif v_status = 'pending' then
      raise exception 'Your request is already pending. Wait for the member to respond.';
    elsif v_status = 'blocked' then
      raise exception 'This conversation is blocked.';
    else
      raise exception 'This conversation was declined and is closed.';
    end if;
  end if;

  select count(*)::integer into v_recent_requests
  from public.campus_direct_conversations c
  where c.requested_by = v_user_id
    and c.status = 'pending'
    and c.created_at > now() - interval '24 hours';
  if v_recent_requests >= 8 then
    raise exception 'You have reached the daily message-request limit. Try again tomorrow.';
  end if;

  insert into public.campus_direct_conversations
    (university_id, user_one_id, user_two_id, requested_by, status, last_message_at)
  values (v_university_id, v_user_one, v_user_two, v_user_id, 'pending', now())
  returning id into v_conversation_id;

  insert into public.campus_direct_messages
    (conversation_id, university_id, sender_id, author_username, body)
  values (v_conversation_id, v_university_id, v_user_id, v_sender_username, v_body);

  return v_conversation_id;
exception when unique_violation then
  raise exception 'A message request with this member already exists. Refresh your inbox.';
end;
$function$;

create or replace function public.send_campus_direct_message(
  p_conversation_id uuid,
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
  v_status text;
  v_recent_count integer;
  v_message_id uuid;
  v_body text := btrim(coalesce(p_body,''));
begin
  if v_user_id is null then raise exception 'Sign in before sending a private message.'; end if;
  if v_university_id is null or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required for private messaging.';
  end if;
  if char_length(v_body) not between 1 and 1200 then
    raise exception 'Messages must be between 1 and 1200 characters.';
  end if;

  select c.status into v_status
  from public.campus_direct_conversations c
  where c.id = p_conversation_id
    and c.university_id = v_university_id
    and (c.user_one_id = v_user_id or c.user_two_id = v_user_id)
  for update;

  if not found then raise exception 'Conversation not found in your university.'; end if;
  if v_status <> 'accepted' then raise exception 'Accept the message request before sending replies.'; end if;

  select count(*)::integer into v_recent_count
  from public.campus_direct_messages m
  where m.sender_id = v_user_id
    and m.created_at > now() - interval '1 minute';
  if v_recent_count >= 12 then
    raise exception 'You are sending messages too quickly. Wait a minute before trying again.';
  end if;

  select cp.username into v_username
  from public.community_profiles cp where cp.user_id = v_user_id;
  if v_username is null then raise exception 'Your campus username is not ready. Refresh and try again.'; end if;

  insert into public.campus_direct_messages
    (conversation_id, university_id, sender_id, author_username, body)
  values (p_conversation_id, v_university_id, v_user_id, v_username, v_body)
  returning id into v_message_id;

  update public.campus_direct_conversations
  set last_message_at = now(), updated_at = now()
  where id = p_conversation_id;

  return v_message_id;
end;
$function$;

create or replace function public.respond_campus_direct_message_request(
  p_conversation_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_requested_by uuid;
  v_status text;
begin
  if v_user_id is null then raise exception 'Sign in to manage message requests.'; end if;
  if v_university_id is null or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required for private messaging.';
  end if;
  if p_action is null or p_action not in ('accept','decline','cancel','block') then
    raise exception 'Choose accept, decline, cancel or block.';
  end if;

  select c.requested_by, c.status into v_requested_by, v_status
  from public.campus_direct_conversations c
  where c.id = p_conversation_id
    and c.university_id = v_university_id
    and (c.user_one_id = v_user_id or c.user_two_id = v_user_id)
  for update;

  if not found then raise exception 'Conversation not found in your university.'; end if;

  if p_action = 'block' then
    if v_status = 'blocked' then return true; end if;
    update public.campus_direct_conversations
    set status='blocked', blocked_by=v_user_id, updated_at=now()
    where id=p_conversation_id;
    return true;
  end if;

  if v_status <> 'pending' then raise exception 'This message request is no longer pending.'; end if;
  if p_action = 'cancel' then
    if v_requested_by <> v_user_id then raise exception 'Only the sender can cancel their own message request.'; end if;
    update public.campus_direct_conversations set status='cancelled', updated_at=now() where id=p_conversation_id;
    return true;
  end if;
  if v_requested_by = v_user_id then raise exception 'Only the recipient can accept or decline a message request.'; end if;

  update public.campus_direct_conversations
  set status = case when p_action='accept' then 'accepted' else 'declined' end,
      updated_at=now()
  where id=p_conversation_id;
  return true;
end;
$function$;

create or replace function public.report_campus_direct_message(
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
  v_conversation_id uuid;
  v_sender_id uuid;
  v_report_id uuid;
  v_details text := nullif(btrim(coalesce(p_details,'')), '');
begin
  if v_user_id is null then raise exception 'Sign in before reporting a private message.'; end if;
  if v_university_id is null or not coalesce((select private.current_user_has_verified_campus_access()), false) then
    raise exception 'Verified campus access is required to report messages.';
  end if;
  if p_reason is null or p_reason not in ('spam','harassment','personal_information','threats','other') then
    raise exception 'Choose a valid report reason.';
  end if;
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'Report details must be 500 characters or fewer.';
  end if;

  select m.conversation_id, m.sender_id into v_conversation_id, v_sender_id
  from public.campus_direct_messages m
  join public.campus_direct_conversations c on c.id=m.conversation_id
  where m.id=p_message_id
    and m.university_id=v_university_id
    and m.status='published'
    and c.status in ('pending','accepted')
    and (c.user_one_id=v_user_id or c.user_two_id=v_user_id);

  if not found then raise exception 'This private message is no longer available to report.'; end if;
  if v_sender_id = v_user_id then raise exception 'You cannot report your own message.'; end if;

  insert into public.campus_direct_message_reports
    (message_id,conversation_id,university_id,reporter_id,reason,details)
  values (p_message_id,v_conversation_id,v_university_id,v_user_id,p_reason,v_details)
  returning id into v_report_id;
  return v_report_id;
exception when unique_violation then
  raise exception 'You have already reported this message.';
end;
$function$;

create or replace function public.list_campus_direct_message_reports()
returns table (
  report_id uuid,
  conversation_id uuid,
  message_id uuid,
  message_body text,
  author_username text,
  reporter_username text,
  reason text,
  details text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if auth.uid() is null then raise exception 'Sign in before reviewing message reports.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()), false)
     or coalesce((select private.current_campus_role()), '') not in ('admin','security','teacher') then
    raise exception 'Only verified campus staff can review private-message reports.';
  end if;

  return query
  select r.id, r.conversation_id, r.message_id, m.body, m.author_username,
         coalesce(rp.username,'campus_member'), r.reason, r.details, r.created_at
  from public.campus_direct_message_reports r
  join public.campus_direct_messages m on m.id=r.message_id
  left join public.community_profiles rp on rp.user_id=r.reporter_id
  where r.university_id=v_university_id and r.status='pending'
  order by r.created_at asc
  limit 100;
end;
$function$;

create or replace function public.resolve_campus_direct_message_report(
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
  v_message_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before reviewing message reports.'; end if;
  if not coalesce((select private.current_user_has_verified_campus_access()), false)
     or coalesce((select private.current_campus_role()), '') not in ('admin','security','teacher') then
    raise exception 'Only verified campus staff can review private-message reports.';
  end if;
  if p_decision is null or p_decision not in ('hide','dismiss') then
    raise exception 'Choose hide or dismiss.';
  end if;

  select r.message_id into v_message_id
  from public.campus_direct_message_reports r
  where r.id=p_report_id and r.university_id=v_university_id and r.status='pending'
  for update;
  if not found then raise exception 'This pending report was not found in your university.'; end if;

  if p_decision='hide' then
    update public.campus_direct_messages
    set status='hidden',updated_at=now()
    where id=v_message_id and university_id=v_university_id;
    update public.campus_direct_message_reports set status='reviewed' where id=p_report_id;
  else
    update public.campus_direct_message_reports set status='dismissed' where id=p_report_id;
  end if;
  return true;
end;
$function$;

revoke all on function public.search_campus_members(text) from public, anon, authenticated;
revoke all on function public.list_my_campus_direct_conversations() from public, anon, authenticated;
revoke all on function public.list_campus_direct_messages(uuid) from public, anon, authenticated;
revoke all on function public.create_campus_direct_message_request(text,text) from public, anon, authenticated;
revoke all on function public.send_campus_direct_message(uuid,text) from public, anon, authenticated;
revoke all on function public.respond_campus_direct_message_request(uuid,text) from public, anon, authenticated;
revoke all on function public.report_campus_direct_message(uuid,text,text) from public, anon, authenticated;
revoke all on function public.list_campus_direct_message_reports() from public, anon, authenticated;
revoke all on function public.resolve_campus_direct_message_report(uuid,text) from public, anon, authenticated;

grant execute on function public.search_campus_members(text) to authenticated;
grant execute on function public.list_my_campus_direct_conversations() to authenticated;
grant execute on function public.list_campus_direct_messages(uuid) to authenticated;
grant execute on function public.create_campus_direct_message_request(text,text) to authenticated;
grant execute on function public.send_campus_direct_message(uuid,text) to authenticated;
grant execute on function public.respond_campus_direct_message_request(uuid,text) to authenticated;
grant execute on function public.report_campus_direct_message(uuid,text,text) to authenticated;
grant execute on function public.list_campus_direct_message_reports() to authenticated;
grant execute on function public.resolve_campus_direct_message_report(uuid,text) to authenticated;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='campus_direct_messages'
     ) then
    execute 'alter publication supabase_realtime add table public.campus_direct_messages';
  end if;
end;
$publication$;

commit;
