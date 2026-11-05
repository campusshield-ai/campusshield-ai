-- Index the live-session creator foreign key for account cleanup and joins.
create index if not exists campus_live_class_sessions_created_by_idx
  on public.campus_live_class_sessions (created_by);
