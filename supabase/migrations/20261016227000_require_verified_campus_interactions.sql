-- Pending accounts may submit content for moderation, but interactions with published
-- campus content require verified campus access. Restrictive RLS policies prevent
-- direct PostgREST writes from bypassing the verified-only interaction rules.
begin;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'campus_event_rsvps',
    'campus_follows',
    'campus_group_members',
    'community_poll_votes',
    'community_post_bookmarks',
    'community_post_reactions'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I',
      'verified_account_required_for_interactions',
      v_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.current_user_has_verified_campus_access()) with check (private.current_user_has_verified_campus_access())',
      'verified_account_required_for_interactions',
      v_table
    );
  end loop;
end
$$;

commit;
