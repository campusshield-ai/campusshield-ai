-- Private, account-owned ShieldMind conversation history.
-- Conversation content is never exposed through public/anonymous access.
create table if not exists public.shieldmind_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  messages jsonb not null default '[]'::jsonb
    check (case when jsonb_typeof(messages) = 'array' then jsonb_array_length(messages) <= 100 else false end),
  search_text text generated always as (
    coalesce(title, '') || ' ' || coalesce(messages::text, '')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shieldmind_conversations_messages_size
    check (octet_length(messages::text) <= 1048576)
);

create index if not exists shieldmind_conversations_owner_updated_idx
  on public.shieldmind_conversations (user_id, updated_at desc);

alter table public.shieldmind_conversations enable row level security;
alter table public.shieldmind_conversations force row level security;

revoke all on public.shieldmind_conversations from anon, public;
grant select, insert, update, delete on public.shieldmind_conversations to authenticated;

drop policy if exists shieldmind_conversations_select_own
  on public.shieldmind_conversations;
create policy shieldmind_conversations_select_own
  on public.shieldmind_conversations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists shieldmind_conversations_insert_own
  on public.shieldmind_conversations;
create policy shieldmind_conversations_insert_own
  on public.shieldmind_conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists shieldmind_conversations_update_own
  on public.shieldmind_conversations;
create policy shieldmind_conversations_update_own
  on public.shieldmind_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists shieldmind_conversations_delete_own
  on public.shieldmind_conversations;
create policy shieldmind_conversations_delete_own
  on public.shieldmind_conversations
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.shieldmind_conversations is
  'Private ShieldMind chat history. Every row is restricted to its owning authenticated user.';
