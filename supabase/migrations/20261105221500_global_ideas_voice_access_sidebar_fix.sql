-- CampusShield-wide Ideas & Impact discovery and participant-scoped voice playback.
-- Approved ideas are globally discoverable by signed-in CampusShield members.
-- Contributions require verified campus membership; moderation stays local to the idea's university.
-- Private-message voice notes require the reader to be a verified conversation participant.

begin;

drop policy if exists campus_ideas_read_verified_campus on public.campus_ideas;
drop policy if exists campus_ideas_read_global_published on public.campus_ideas;
create policy campus_ideas_read_global_published
on public.campus_ideas for select to authenticated
using (
  (select auth.uid()) is not null
  and (
    status in ('published','planned','in_progress','implemented')
    or user_id = (select auth.uid())
    or (
      university_id = private.current_campus_university_id()
      and private.current_user_has_verified_campus_access()
      and private.current_campus_role() in ('admin','security','teacher')
    )
  )
);

drop policy if exists campus_idea_supports_read_own on public.campus_idea_supports;
drop policy if exists campus_idea_supports_read_own_global on public.campus_idea_supports;
create policy campus_idea_supports_read_own_global
on public.campus_idea_supports for select to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
);

drop policy if exists campus_idea_supports_insert_other_published on public.campus_idea_supports;
drop policy if exists campus_idea_supports_insert_global_published on public.campus_idea_supports;
create policy campus_idea_supports_insert_global_published
on public.campus_idea_supports for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
    where i.id = campus_idea_supports.idea_id
      and i.status in ('published','planned','in_progress','implemented')
      and i.user_id <> (select auth.uid())
  )
);

drop policy if exists campus_idea_supports_delete_own on public.campus_idea_supports;
drop policy if exists campus_idea_supports_delete_own_global on public.campus_idea_supports;
create policy campus_idea_supports_delete_own_global
on public.campus_idea_supports for delete to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
);

drop policy if exists campus_idea_comments_read_published_ideas on public.campus_idea_comments;
drop policy if exists campus_idea_comments_read_global_published on public.campus_idea_comments;
create policy campus_idea_comments_read_global_published
on public.campus_idea_comments for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.campus_ideas i
    where i.id = campus_idea_comments.idea_id
      and i.status in ('published','planned','in_progress','implemented')
  )
);

drop trigger if exists campus_idea_comments_prepare_item on public.campus_idea_comments;
drop trigger if exists campus_idea_comments_prepare_global_item on public.campus_idea_comments;
create or replace function private.prepare_campus_idea_comment_global()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_username text;
  v_idea_university_id uuid;
begin
  if (select auth.uid()) is null
     or not private.current_user_has_verified_campus_access() then
    raise exception 'Verified CampusShield membership is required to comment on ideas.';
  end if;

  if tg_op = 'INSERT' then
    select i.university_id into v_idea_university_id
    from public.campus_ideas i
    where i.id = new.idea_id
      and i.status in ('published','planned','in_progress','implemented');
    if v_idea_university_id is null then raise exception 'This idea is not available for discussion.'; end if;

    select cp.username into v_username
    from public.community_profiles cp
    where cp.user_id = (select auth.uid());
    if v_username is null then raise exception 'Set up your CampusPulse username before commenting.'; end if;

    new.user_id := (select auth.uid());
    new.university_id := v_idea_university_id;
    new.creator_username := v_username;
    new.created_at := now();
  else
    if new.user_id is distinct from old.user_id
       or new.university_id is distinct from old.university_id
       or new.creator_username is distinct from old.creator_username
       or new.idea_id is distinct from old.idea_id then
      raise exception 'Comment ownership and idea cannot be changed.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger campus_idea_comments_prepare_global_item
before insert or update on public.campus_idea_comments
for each row execute function private.prepare_campus_idea_comment_global();
revoke all on function private.prepare_campus_idea_comment_global() from public, anon, authenticated;

drop policy if exists campus_idea_comments_insert_published_ideas on public.campus_idea_comments;
drop policy if exists campus_idea_comments_insert_global_published on public.campus_idea_comments;
create policy campus_idea_comments_insert_global_published
on public.campus_idea_comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
  and exists (
    select 1 from public.campus_ideas i
    where i.id = campus_idea_comments.idea_id
      and i.university_id = campus_idea_comments.university_id
      and i.status in ('published','planned','in_progress','implemented')
  )
);

drop policy if exists campus_idea_comments_delete_own on public.campus_idea_comments;
drop policy if exists campus_idea_comments_delete_own_global on public.campus_idea_comments;
create policy campus_idea_comments_delete_own_global
on public.campus_idea_comments for delete to authenticated
using (
  user_id = (select auth.uid())
  and private.current_user_has_verified_campus_access()
);

drop policy if exists campus_idea_status_updates_read_visible_ideas on public.campus_idea_status_updates;
drop policy if exists campus_idea_status_updates_read_global_visible on public.campus_idea_status_updates;
create policy campus_idea_status_updates_read_global_visible
on public.campus_idea_status_updates for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.campus_ideas i
    where i.id = campus_idea_status_updates.idea_id
      and i.university_id = campus_idea_status_updates.university_id
      and (
        i.status in ('published','planned','in_progress','implemented')
        or i.user_id = (select auth.uid())
        or (
          i.university_id = private.current_campus_university_id()
          and private.current_user_has_verified_campus_access()
          and private.current_campus_role() in ('admin','security','teacher')
        )
      )
  )
);

create index if not exists campus_ideas_global_published_feed_idx
on public.campus_ideas (status, created_at desc)
where status in ('published','planned','in_progress','implemented');

-- Tighten the already-private voice bucket: the object path alone must never
-- reveal a private message attachment to a different CampusShield member.
drop policy if exists campus_voice_notes_read_linked_messages on storage.objects;
create policy campus_voice_notes_read_linked_messages
on storage.objects for select to authenticated
using (
  bucket_id = 'campus-chat-voice-notes'
  and (
    (
      (storage.foldername(name))[1] = 'campus'
      and (storage.foldername(name))[2] = (select private.current_campus_university_id())::text
      and private.current_user_has_verified_campus_access()
      and exists (
        select 1 from public.campus_chat_messages m
        where m.university_id = (select private.current_campus_university_id())
          and m.status = 'published'
          and position(objects.name in m.body) > 0
      )
    )
    or
    (
      (storage.foldername(name))[1] = 'direct'
      and exists (
        select 1 from public.campus_direct_messages m
        where m.conversation_id::text = (storage.foldername(name))[2]
          and m.status = 'published'
          and position(objects.name in m.body) > 0
          and private.can_read_campus_direct_message(m.conversation_id,m.university_id,m.sender_id)
      )
    )
  )
);

comment on table public.campus_ideas is
  'Student proposals; approved ideas are discoverable by all signed-in CampusShield members, while pending drafts remain campus-moderated.';
comment on table public.campus_idea_comments is
  'Discussion on published CampusShield ideas; comments retain the origin idea university and authenticated author.';

commit;
