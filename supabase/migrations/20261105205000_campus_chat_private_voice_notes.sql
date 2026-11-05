-- Private, participant-scoped voice notes for Campus Chat and Private Messages.
-- Audio is readable only after a published message links its object path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campus-chat-voice-notes',
  'campus-chat-voice-notes',
  false,
  8388608,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campus_voice_notes_read_linked_messages on storage.objects;
create policy campus_voice_notes_read_linked_messages
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campus-chat-voice-notes'
  and (
    (
      (storage.foldername(name))[1] = 'campus'
      and (storage.foldername(name))[2] = (select private.current_campus_university_id())::text
      and exists (
        select 1
        from public.campus_chat_messages m
        where m.university_id = (select private.current_campus_university_id())
          and m.status = 'published'
          and position(objects.name in m.body) > 0
      )
    )
    or
    (
      (storage.foldername(name))[1] = 'direct'
      and exists (
        select 1
        from public.campus_direct_messages m
        where m.conversation_id::text = (storage.foldername(name))[2]
          and m.status = 'published'
          and position(objects.name in m.body) > 0
      )
    )
  )
);

drop policy if exists campus_voice_notes_upload_sender on storage.objects;
create policy campus_voice_notes_upload_sender
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campus-chat-voice-notes'
  and lower(storage.extension(name)) = any (array['webm','ogg','m4a','mp3','wav']::text[])
  and coalesce(metadata->>'mimetype', '') = any (
    array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav']::text[]
  )
  and coalesce(nullif(metadata->>'size','')::bigint, 0) between 1 and 8388608
  and (
    (
      (storage.foldername(name))[1] = 'campus'
      and (storage.foldername(name))[2] = (select private.current_campus_university_id())::text
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and (select private.current_user_has_verified_campus_access())
    )
    or
    (
      (storage.foldername(name))[1] = 'direct'
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.can_read_campus_direct_message(
          (storage.foldername(name))[2]::uuid,
          (select private.current_campus_university_id()),
          (select auth.uid())
        )
        else false
      end
    )
  )
);

drop policy if exists campus_voice_notes_delete_unlinked_sender on storage.objects;
create policy campus_voice_notes_delete_unlinked_sender
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campus-chat-voice-notes'
  and (
    (
      (storage.foldername(name))[1] = 'campus'
      and (storage.foldername(name))[2] = (select private.current_campus_university_id())::text
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and not exists (
        select 1 from public.campus_chat_messages m
        where m.university_id = (select private.current_campus_university_id())
          and position(objects.name in m.body) > 0
      )
    )
    or
    (
      (storage.foldername(name))[1] = 'direct'
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and case
        when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.can_read_campus_direct_message(
          (storage.foldername(name))[2]::uuid,
          (select private.current_campus_university_id()),
          (select auth.uid())
        )
        else false
      end
      and not exists (
        select 1 from public.campus_direct_messages m
        where m.conversation_id::text = (storage.foldername(name))[2]
          and position(objects.name in m.body) > 0
      )
    )
  )
);
