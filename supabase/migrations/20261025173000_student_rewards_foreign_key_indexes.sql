-- Index challenge foreign keys used by reward aggregation and badge joins.
create index if not exists student_challenge_progress_challenge_idx
  on public.student_challenge_progress (challenge_id);
create index if not exists student_points_ledger_challenge_idx
  on public.student_points_ledger (challenge_id);
create index if not exists student_user_badges_badge_idx
  on public.student_user_badges (badge_id);