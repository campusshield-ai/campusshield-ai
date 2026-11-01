-- Prevent connection requests to members blocked by the requester.
-- Applied to Staging as 20261101174607.
create or replace function private.prepare_campus_peer_connection()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_recipient uuid;
  v_recipient_username text;
  v_username text;
  v_university uuid;
  v_open boolean := false;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.current_user_has_verified_campus_access() then raise exception 'Verified campus membership is required.'; end if;
    v_university := private.current_campus_university_id();
    select cp.username into v_username from public.community_profiles cp where cp.user_id = auth.uid();
    if v_university is null or v_username is null then raise exception 'Choose your university and set up your CampusPulse username first.'; end if;
    if new.source_type = 'collab' then
      select l.user_id,l.creator_username,(l.status = 'open' and l.expires_at > now()) into v_recipient,v_recipient_username,v_open
      from public.campus_collab_listings l where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'event_buddy' then
      select l.user_id,l.creator_username,(l.status = 'open' and e.status = 'published' and e.starts_at > now()) into v_recipient,v_recipient_username,v_open
      from public.campus_event_buddy_listings l join public.campus_events e on e.id = l.event_id
      where l.id = new.source_id and l.university_id = v_university;
    elsif new.source_type = 'mentorship' then
      select l.user_id,l.creator_username,l.is_active into v_recipient,v_recipient_username,v_open
      from public.campus_mentorship_profiles l where l.id = new.source_id and l.university_id = v_university;
    end if;
    if v_recipient is null or not coalesce(v_open,false) then raise exception 'This CampusPulse opportunity is no longer available.'; end if;
    if v_recipient = auth.uid() then raise exception 'You cannot send a connection request to yourself.'; end if;
    if private.is_campus_member_blocked(v_recipient,v_university) then
      raise exception 'A connection request cannot be sent because this connection is unavailable.';
    end if;
    new.requester_id := auth.uid();
    new.requester_username := v_username;
    new.recipient_id := v_recipient;
    new.recipient_username := v_recipient_username;
    new.university_id := v_university;
    new.status := 'pending';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id or new.source_type is distinct from old.source_type or new.source_id is distinct from old.source_id
    or new.requester_id is distinct from old.requester_id or new.requester_username is distinct from old.requester_username
    or new.recipient_id is distinct from old.recipient_id or new.recipient_username is distinct from old.recipient_username
    or new.university_id is distinct from old.university_id or new.note is distinct from old.note or new.created_at is distinct from old.created_at then
    raise exception 'Connection request details cannot be rewritten.';
  end if;
  if old.status <> 'pending' then raise exception 'This connection request has already been handled.'; end if;
  if auth.uid() = old.recipient_id and new.status in ('accepted','declined') then null;
  elsif auth.uid() = old.requester_id and new.status = 'withdrawn' then null;
  else raise exception 'Only the recipient may accept or decline; the sender may withdraw.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campus_peer_connection() from public,anon,authenticated;