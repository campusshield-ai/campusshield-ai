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
