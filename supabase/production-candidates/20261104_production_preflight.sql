-- READ-ONLY Production preflight: SELECT statements only.
select current_database() as database_name,
       current_setting('server_version') as postgres_version,
       now() as checked_at;

select count(*)::int as production_public_table_count
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE';

with targets(table_name,phase) as (
  values
    ('campus_map_features','CampusMap'),('campus_map_campuses','CampusMap'),('campus_map_buildings','CampusMap'),
    ('campus_member_blocks','CampusPulse dependency'),
    ('campus_collab_listings','CampusPulse'),('campus_event_buddy_listings','CampusPulse'),
    ('campus_mentorship_profiles','CampusPulse'),('campus_memories','CampusPulse'),
    ('campus_peer_connection_requests','CampusPulse'),('campus_social_feature_reports','CampusPulse'),
    ('past_question_papers','Past Questions'),('past_question_items','Past Questions'),
    ('past_question_answer_keys','Past Questions'),('practice_attempts','Past Questions'),
    ('practice_answers','Past Questions')
)
select t.phase,t.table_name,(c.table_name is not null) as already_exists
from targets t
left join information_schema.tables c
  on c.table_schema='public' and c.table_name=t.table_name and c.table_type='BASE TABLE'
order by t.phase,t.table_name;

select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='incidents'
order by ordinal_position;

select table_name
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE'
  and table_name in (
    'campus_institutional_billing_requests',
    'campus_opportunity_bookmarks',
    'shieldmind_payment_orders'
  )
order by table_name;

select helper_name,present
from (
  values
    ('private.current_campus_university_id()',to_regprocedure('private.current_campus_university_id()') is not null),
    ('private.current_campus_role()',to_regprocedure('private.current_campus_role()') is not null),
    ('private.current_user_can_use_restricted_features()',to_regprocedure('private.current_user_can_use_restricted_features()') is not null),
    ('private.current_user_has_verified_campus_access()',to_regprocedure('private.current_user_has_verified_campus_access()') is not null),
    ('private.is_campusshield_owner_admin()',to_regprocedure('private.is_campusshield_owner_admin()') is not null)
) as f(helper_name,present);

-- Stop if a candidate RPC already exists before these first-time table additions.
-- Some source migrations replace earlier definitions within this same candidate phase;
-- this guard ensures those DROP/CREATE transitions cannot touch pre-existing Production RPCs.
do $function_collision_preflight$
declare
  v_signature text;
  v_collisions text[] := array[]::text[];
begin
  foreach v_signature in array array[
    'public.can_read_campus_map_drafts(uuid)',
    'public.manage_campus_map_feature(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean)',
    'public.manage_campus_map_feature(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb)',
    'private.manage_campus_map_feature_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean)',
    'private.manage_campus_map_feature_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb)',
    'public.manage_campus_map_campus(uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text)',
    'private.manage_campus_map_campus_impl(uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text)',
    'private.is_campus_member_blocked(uuid,uuid)',
    'private.prepare_campuspulse_social_item()',
    'private.prepare_campus_peer_connection()',
    'private.prepare_campus_social_report()',
    'private.import_campus_map_building_candidates_impl(uuid,jsonb)',
    'private.import_campus_map_building_candidates_legacy(uuid,jsonb)',
    'public.import_campus_map_building_candidates(uuid,jsonb)',
    'private.review_campus_map_building_impl(uuid,text,text,boolean)',
    'public.review_campus_map_building(uuid,text,text,boolean)',
    'private.manage_campus_map_feature_with_metadata_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb)',
    'public.add_past_question_item_with_answer_key(uuid,integer,text,text,jsonb,text,numeric,text,text,text)',
    'public.get_past_question_coverage()',
    'public.past_question_exam_prep_access()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      v_collisions := array_append(v_collisions,v_signature);
    end if;
  end loop;
  if cardinality(v_collisions)>0 then
    raise exception 'A candidate RPC already exists in Production; compare it manually before proceeding: %',
      array_to_string(v_collisions,', ');
  end if;
end
$function_collision_preflight$;


select p.role,p.requested_role,p.verification_status as profile_status,
       cm.campus_role,cm.membership_status,cm.verification_status as membership_verification,
       count(*)::bigint as account_count
from public.profiles p
left join public.campus_memberships cm on cm.user_id=p.id
group by 1,2,3,4,5,6
order by 1,2,3,4,5,6;

select status,confirmed_fraud,count(*)::bigint as rows
from public.student_identity_verifications
group by 1,2
order by 1,2;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
where id='past-question-files';

-- Fail closed if any existing Storage policy on objects can match without
-- an explicit bucket_id predicate. Existing policies must not broaden the
-- new Past Questions bucket's private access boundary.
do $storage_policy_preflight$
declare
  v_unscoped_count integer;
begin
  if to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage objects table is missing.';
  end if;

  select count(*)::integer into v_unscoped_count
  from pg_policy p
  where p.polrelid='storage.objects'::regclass
    and coalesce(pg_get_expr(p.polqual,p.polrelid),'') not ilike '%bucket_id%'
    and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not ilike '%bucket_id%';

  if v_unscoped_count > 0 then
    raise exception 'Storage objects has % policy/policies without an explicit bucket_id scope; review before adding Past Questions files.',v_unscoped_count;
  end if;
end
$storage_policy_preflight$;
