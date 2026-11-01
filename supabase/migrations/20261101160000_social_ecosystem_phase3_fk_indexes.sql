-- Phase 3 foreign-key indexes for campus social privacy and notification lookups.
begin;
create index if not exists campus_member_blocks_university_idx
  on public.campus_member_blocks(university_id, blocker_id, blocked_id);
create index if not exists campus_social_notifications_actor_idx
  on public.campus_social_notifications(actor_id);
create index if not exists campus_social_notifications_university_idx
  on public.campus_social_notifications(university_id);
commit;
