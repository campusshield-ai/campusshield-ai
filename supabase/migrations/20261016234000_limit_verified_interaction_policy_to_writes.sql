-- Keep existing read policies intact while requiring verified campus access for direct writes.
-- The previous FOR ALL restrictive policy also filtered SELECT queries, which could hide
-- public campus content/reaction counts from pending users. This follow-up limits the gate to writes.
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
    execute format('drop policy if exists %I on public.%I',
      'verified_account_required_for_interactions', v_table);
    execute format('drop policy if exists %I on public.%I',
      'verified_account_required_for_interaction_insert', v_table);
    execute format('drop policy if exists %I on public.%I',
      'verified_account_required_for_interaction_update', v_table);
    execute format('drop policy if exists %I on public.%I',
      'verified_account_required_for_interaction_delete', v_table);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (private.current_user_has_verified_campus_access())',
      'verified_account_required_for_interaction_insert', v_table);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (private.current_user_has_verified_campus_access()) with check (private.current_user_has_verified_campus_access())',
      'verified_account_required_for_interaction_update', v_table);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (private.current_user_has_verified_campus_access())',
      'verified_account_required_for_interaction_delete', v_table);
  end loop;
end
$$;

commit;
