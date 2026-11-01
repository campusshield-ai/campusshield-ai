-- Guard event links on edits too. Applied to Staging as 20261101174446.
create or replace function private.prepare_campuspulse_social_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event_university uuid;
  v_event_status text;
  v_event_start timestamptz;
begin
  if auth.uid() is null or not private.current_user_has_verified_campus_access() then
    raise exception 'Verified campus membership is required.';
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.university_id := private.current_campus_university_id();
    if new.university_id is null then raise exception 'Choose your university first.'; end if;
    select cp.username into new.creator_username from public.community_profiles cp where cp.user_id = auth.uid();
    if new.creator_username is null then raise exception 'Set up your CampusPulse username first.'; end if;
    new.created_at := now();
    if tg_table_name = 'campus_event_buddy_listings' then
      select e.university_id,e.status,e.starts_at into v_event_university,v_event_status,v_event_start
      from public.campus_events e where e.id = new.event_id;
      if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' or v_event_start <= now() then
        raise exception 'Choose an upcoming published event from your own university.';
      end if;
    elsif tg_table_name = 'campus_memories' then
      if new.event_id is not null then
        select e.university_id,e.status into v_event_university,v_event_status from public.campus_events e where e.id = new.event_id;
        if v_event_university is distinct from new.university_id or v_event_status is distinct from 'published' then
          raise exception 'A memory can only be linked to a published event at your university.';
        end if;
      end if;
      new.status := 'pending';
    elsif tg_table_name = 'campus_mentorship_profiles' then
      new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.university_id is distinct from old.university_id or new.creator_username is distinct from old.creator_username then
    raise exception 'CampusPulse ownership and campus cannot be changed.';
  end if;
  if tg_table_name = 'campus_event_buddy_listings' and new.event_id is distinct from old.event_id then
    select e.university_id,e.status,e.starts_at into v_event_university,v_event_status,v_event_start
    from public.campus_events e where e.id = new.event_id;
    if v_event_university is distinct from old.university_id or v_event_status is distinct from 'published' or v_event_start <= now() then
      raise exception 'An event-buddy request must remain linked to an upcoming published event at your university.';
    end if;
  elsif tg_table_name = 'campus_memories' then
    if auth.uid() <> old.user_id and (new.title is distinct from old.title or new.memory_text is distinct from old.memory_text or new.event_id is distinct from old.event_id) then
      raise exception 'Moderators may change memory review status, not rewrite a student memory.';
    end if;
    if new.event_id is distinct from old.event_id and new.event_id is not null then
      select e.university_id,e.status into v_event_university,v_event_status from public.campus_events e where e.id = new.event_id;
      if v_event_university is distinct from old.university_id or v_event_status is distinct from 'published' then
        raise exception 'A memory can only be linked to a published event at your university.';
      end if;
    end if;
  elsif tg_table_name = 'campus_mentorship_profiles' then
    new.mentor_type := case when private.current_campus_role() in ('admin','security','teacher') then 'staff' else 'peer' end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.prepare_campuspulse_social_item() from public,anon,authenticated;