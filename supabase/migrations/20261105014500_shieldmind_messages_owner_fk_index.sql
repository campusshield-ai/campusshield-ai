-- Cover the composite owner foreign key used to enforce message ownership.
create index if not exists shieldmind_messages_conversation_owner_idx
  on public.shieldmind_messages (conversation_id, user_id);
