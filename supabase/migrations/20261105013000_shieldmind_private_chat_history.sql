-- Private, account-owned text history for the paid ShieldMind workspace.
-- No study-image binaries or sensitive CampusShield records are stored here.

create table if not exists public.shieldmind_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint shieldmind_conversations_id_user_id_key unique (id, user_id)
);

create index if not exists shieldmind_conversations_user_updated_idx
  on public.shieldmind_conversations (user_id, updated_at desc);

create table if not exists public.shieldmind_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 30000),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default now(),
  constraint shieldmind_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.shieldmind_conversations (id, user_id)
    on delete cascade
);

create index if not exists shieldmind_messages_conversation_created_idx
  on public.shieldmind_messages (conversation_id, created_at);

create index if not exists shieldmind_messages_user_created_idx
  on public.shieldmind_messages (user_id, created_at desc);

alter table public.shieldmind_conversations enable row level security;
alter table public.shieldmind_messages enable row level security;

revoke all on table public.shieldmind_conversations, public.shieldmind_messages from anon, public;
grant select, insert, update, delete on table public.shieldmind_conversations to authenticated;
grant select, insert, delete on table public.shieldmind_messages to authenticated;

drop policy if exists shieldmind_conversations_select_own on public.shieldmind_conversations;
create policy shieldmind_conversations_select_own
  on public.shieldmind_conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists shieldmind_conversations_insert_own on public.shieldmind_conversations;
create policy shieldmind_conversations_insert_own
  on public.shieldmind_conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists shieldmind_conversations_update_own on public.shieldmind_conversations;
create policy shieldmind_conversations_update_own
  on public.shieldmind_conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists shieldmind_conversations_delete_own on public.shieldmind_conversations;
create policy shieldmind_conversations_delete_own
  on public.shieldmind_conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists shieldmind_messages_select_own on public.shieldmind_messages;
create policy shieldmind_messages_select_own
  on public.shieldmind_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists shieldmind_messages_insert_own on public.shieldmind_messages;
create policy shieldmind_messages_insert_own
  on public.shieldmind_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.shieldmind_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

drop policy if exists shieldmind_messages_delete_own on public.shieldmind_messages;
create policy shieldmind_messages_delete_own
  on public.shieldmind_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.shieldmind_conversations is
  'Private per-account ShieldMind conversation headers. Conversation access is enforced by RLS.';
comment on table public.shieldmind_messages is
  'Private text-only ShieldMind transcript messages. Uploaded study images and binary attachments are not stored.';
