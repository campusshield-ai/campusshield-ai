-- Postflight assertions: run only on the disposable DB after all three candidate phases.
do $postflight$
declare
  v_name text;
  v_missing text[] := array[]::text[];
begin
  foreach v_name in array array[
    'campus_map_features','campus_map_campuses','campus_map_buildings',
    'campus_member_blocks','campus_collab_listings','campus_event_buddy_listings',
    'campus_mentorship_profiles','campus_memories','campus_peer_connection_requests',
    'campus_social_feature_reports','past_question_papers','past_question_items',
    'past_question_answer_keys','practice_attempts','practice_answers'
  ] loop
    if to_regclass('public.'||v_name) is null then
      v_missing:=array_append(v_missing,v_name);
    end if;
  end loop;
  if cardinality(v_missing)>0 then
    raise exception 'Missing candidate tables: %',array_to_string(v_missing,', ');
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=any(array[
        'campus_map_features','campus_map_campuses','campus_map_buildings',
        'campus_member_blocks','campus_collab_listings','campus_event_buddy_listings',
        'campus_mentorship_profiles','campus_memories','campus_peer_connection_requests',
        'campus_social_feature_reports','past_question_papers','past_question_items',
        'past_question_answer_keys','practice_attempts','practice_answers'
      ])
      and not c.relrowsecurity
  ) then
    raise exception 'At least one new public table has RLS disabled.';
  end if;

  if has_table_privilege('anon','public.campus_member_blocks','SELECT')
     or has_table_privilege('authenticated','public.campus_member_blocks','SELECT') then
    raise exception 'campus_member_blocks must not be directly selectable by client roles.';
  end if;

  if has_function_privilege('anon','public.get_past_question_coverage()','EXECUTE')
     or not has_function_privilege('authenticated','public.get_past_question_coverage()','EXECUTE') then
    raise exception 'Past Questions coverage RPC grants are incorrect.';
  end if;

  if has_table_privilege('anon','public.past_question_answer_keys','SELECT') then
    raise exception 'Anon has direct SELECT privilege on answer keys.';
  end if;

  if exists (
    select 1 from storage.buckets
    where id='past-question-files' and public is distinct from false
  ) then
    raise exception 'Past Questions PDF bucket must remain private.';
  end if;

  if to_regclass('public.campus_institutional_billing_requests') is null
     or to_regclass('public.campus_opportunity_bookmarks') is null
     or to_regclass('public.shieldmind_payment_orders') is null then
    raise exception 'A Production-only billing/payment table is missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='incidents'
      and column_name='university_id' and is_nullable='YES' and data_type='uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='incidents'
      and column_name='latitude' and is_nullable='YES' and data_type='double precision'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='incidents'
      and column_name='longitude' and is_nullable='YES' and data_type='double precision'
  ) then
    raise exception 'Incident map columns must remain nullable.';
  end if;

  if to_regprocedure('private.current_user_can_use_restricted_features()') is null
     or to_regprocedure('private.current_user_has_verified_campus_access()') is null then
    raise exception 'Production identity-aware access helpers are missing.';
  end if;

  -- New public tables require explicit Data API grants after Supabase's
  -- 2026-10-30 default-exposure cutover. Verify intended client read access.
  if not has_table_privilege('anon','public.campus_map_features','SELECT')
     or not has_table_privilege('authenticated','public.campus_map_features','SELECT')
     or not has_table_privilege('anon','public.campus_map_buildings','SELECT')
     or not has_table_privilege('authenticated','public.campus_map_buildings','SELECT')
     or not has_table_privilege('authenticated','public.campus_map_campuses','SELECT') then
    raise exception 'CampusMap Data API read grants are missing.';
  end if;

  if has_table_privilege('anon','public.campus_map_campuses','SELECT')
     or has_table_privilege('anon','public.campus_collab_listings','SELECT')
     or has_table_privilege('anon','public.campus_event_buddy_listings','SELECT')
     or has_table_privilege('anon','public.campus_mentorship_profiles','SELECT')
     or has_table_privilege('anon','public.campus_memories','SELECT')
     or has_table_privilege('anon','public.campus_peer_connection_requests','SELECT')
     or has_table_privilege('anon','public.campus_social_feature_reports','SELECT')
     or has_table_privilege('anon','public.past_question_papers','SELECT')
     or has_table_privilege('anon','public.past_question_items','SELECT')
     or has_table_privilege('anon','public.past_question_answer_keys','SELECT')
     or has_table_privilege('anon','public.practice_attempts','SELECT')
     or has_table_privilege('anon','public.practice_answers','SELECT') then
    raise exception 'A campus-scoped or private table is exposed to anon.';
  end if;

  -- The deployed Past Questions Edge Function uses its server-only service
  -- client to create practice papers/items/keys, mark attempts and write answers.
  -- Default privileges no longer grant these automatically on new public tables.
  if not has_table_privilege('service_role','public.past_question_papers','SELECT')
     or not has_table_privilege('service_role','public.past_question_papers','INSERT')
     or not has_table_privilege('service_role','public.past_question_papers','DELETE')
     or not has_table_privilege('service_role','public.past_question_items','SELECT')
     or not has_table_privilege('service_role','public.past_question_items','INSERT')
     or not has_table_privilege('service_role','public.past_question_answer_keys','SELECT')
     or not has_table_privilege('service_role','public.past_question_answer_keys','INSERT')
     or not has_table_privilege('service_role','public.practice_attempts','SELECT')
     or not has_table_privilege('service_role','public.practice_attempts','UPDATE')
     or not has_table_privilege('service_role','public.practice_answers','INSERT') then
    raise exception 'Past Questions service_role table grants do not cover the deployed Edge Function.';
  end if;

end
$postflight$;

select 'postflight structural assertions passed' as result;
