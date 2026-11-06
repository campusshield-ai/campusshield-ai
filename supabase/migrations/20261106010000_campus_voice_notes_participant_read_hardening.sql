-- Harden voice-note playback so private-message attachments are visible only to
-- authenticated, verified participants in the underlying conversation.
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
