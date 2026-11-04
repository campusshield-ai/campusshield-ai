-- Babcock Main Campus official-name candidate directory.
-- These are NOT verified map points: no coordinates or point-level source_url is supplied.
-- Every row remains pending/unpublished for the existing verified-campus-admin review workflow.
begin;

with candidates(feature_type,name,description,name_source_url,official_info_source_url,location_relationship_note) as (
  values
    ('hostel','Gideon Troopers Hall','Babcock Residence directory lists Gideon Troopers among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/classic','https://www.babcock.edu.ng/residence',''),
    ('hostel','Bethel Splendor Hall','Babcock Residence directory lists Bethel Splendor among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/classic','https://www.babcock.edu.ng/residence',''),
    ('hostel','Samuel Akande Hall','Babcock Residence directory lists Samuel Akande among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://legacy.babcock.edu.ng/student-life/residence','https://www.babcock.edu.ng/residence/classic',''),
    ('hostel','Felicia Adebisi Dada Hall','Babcock Residence directory lists Felicia Adebisi Dada among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/classic','https://www.babcock.edu.ng/residence',''),
    ('hostel','Platinum Hall','Babcock Residence directory lists Platinum among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/classic','https://www.babcock.edu.ng/residence',''),
    ('hostel','Justice Deborah Hall','Babcock Residence directory lists Justice Deborah among the Classic Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/classic','https://www.babcock.edu.ng/residence',''),
    ('hostel','Neal Wilson Hall','Babcock Residence directory lists Neal Wilson among the Premium Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/premium','https://www.babcock.edu.ng/residence',''),
    ('hostel','Welch Hall','Babcock Residence directory lists Welch among the Premium Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/premium','https://www.babcock.edu.ng/residence',''),
    ('hostel','Crystal Hall','Babcock Residence directory lists Crystal among the Premium Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/premium','https://www.babcock.edu.ng/residence',''),
    ('hostel','Gamaliel Hall','Babcock Residence directory identifies Gamaliel as a Regular Hall. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/regular','https://www.babcock.edu.ng/residence',''),
    ('hostel','White Hall','Babcock Residence directory lists White among the Regular Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/regular','https://www.babcock.edu.ng/residence',''),
    ('hostel','Nybergr Hall','Babcock Residence directory lists Nybergr among the Regular Halls. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/regular','https://www.babcock.edu.ng/residence',''),
    ('hostel','Ogden Hall','Babcock Residence lists Ogden in its Regular Halls section and names its hall administrator. Exact building footprint, entrance and accessible route require on-campus confirmation.','https://www.babcock.edu.ng/residence/regular','https://www.babcock.edu.ng/residence',''),
    ('building','BUCODeL (Centre for Open Distance and e-Learning)','Official university directory identifies BUCODeL. The University Library describes Laz Otti Memorial Library as directly opposite BUCODeL; this relationship is not a substitute for an exact campus pin.','https://www.babcock.edu.ng/codel','https://www.babcock.edu.ng/library','Official Library page: Laz Otti Memorial Library is directly opposite BUCODeL.'),
    ('facility','Ellen G. White-SDA Research Centre','Official university Library information places the Ellen G. White Resource Centre behind the Amphitheater. The centre name is confirmed; its exact point and entrance still need campus review.','https://www.babcock.edu.ng/eg-white','https://www.babcock.edu.ng/library','Official Library page: behind the Amphitheater.'),
    ('facility','Pioneer SDA Church (University Church)','Official Babcock University page identifies the Pioneer SDA Church as the University Church. Exact building point and entrance require campus confirmation.','https://www.babcock.edu.ng/spiritual-life/university-church','https://www.babcock.edu.ng/spiritual-life/university-church',''),
    ('facility','Babcock Business School — Auditorium A','An official Babcock University event listing identifies Babcock Business School (BBS Auditorium A). The auditorium and building entrance coordinates require campus confirmation.','https://www.babcock.edu.ng/spiritual-life/university-church','https://www.babcock.edu.ng/spiritual-life/university-church',''),
    ('sports','Swimming Pool','Official Babcock Sports Facilities page lists a swimming pool. Its precise campus location, access gate and operating arrangements require confirmation.','https://www.babcock.edu.ng/sports/facilities','https://www.babcock.edu.ng/sports/facilities',''),
    ('sports','Table Tennis Court','Official Babcock Sports Facilities page lists a table tennis court. Its precise campus location and accessible entrance require confirmation.','https://www.babcock.edu.ng/sports/facilities','https://www.babcock.edu.ng/sports/facilities',''),
    ('sports','Volleyball Court','Official Babcock Sports Facilities page lists a volleyball court. Its precise campus location and accessible entrance require confirmation.','https://www.babcock.edu.ng/sports/facilities','https://www.babcock.edu.ng/sports/facilities',''),
    ('sports','Basketball Court','Official Babcock Sports Facilities page lists a basketball court. Its precise campus location and accessible entrance require confirmation.','https://www.babcock.edu.ng/sports/facilities','https://www.babcock.edu.ng/sports/facilities',''),
    ('facility','Catering and Food Services','Official Babcock page identifies the Catering and Food Services department and BU Cafeteria services at both campuses. A specific Main Campus serving point and entrance must be identified before map placement.','https://www.babcock.edu.ng/food-services','https://www.babcock.edu.ng/food-services','Official Food Services page describes operations at both Main and Iperu campuses.'),
    ('facility','BUCare Student Support','BUCare contact page lists its visit location as BU Main Campus, beside First Bank. The relative description is official; the exact point and entrance still need an on-campus pin.','https://bucare.babcock.edu.ng/contact','https://bucare.babcock.edu.ng/contact','Official BUCare contact page: BU Main Campus, beside First Bank.')
),
target_campus as (
  select u.id as university_id,cp.campus_name,cp.campus_slug
  from public.campus_universities u
  join public.campus_map_campuses cp on cp.university_id=u.id
  where u.slug='babcock-university' and cp.campus_slug='main-campus'
)
insert into public.campus_map_features(
  university_id,campus_name,campus_slug,feature_type,name,description,
  latitude,longitude,source_url,verification_status,verified_by,verified_at,
  is_published,metadata
)
select
  tc.university_id,tc.campus_name,tc.campus_slug,c.feature_type,c.name,c.description,
  null,null,null,'pending',null,null,false,
  jsonb_strip_nulls(jsonb_build_object(
    'candidate_origin','official_university_directory',
    'name_source_url',c.name_source_url,
    'official_info_source_url',c.official_info_source_url,
    'coordinate_status','missing',
    'coordinate_note','Official source confirms the name or service only. Exact building point, entrance, coordinate and physical-access details have not been verified.',
    'location_relationship_note',nullif(c.location_relationship_note,''),
    'name_source_scope','official_name_or_service_only'
  ))
from target_campus tc
cross join candidates c
where not exists (
  select 1 from public.campus_map_features existing
  where existing.university_id=tc.university_id
    and existing.campus_slug=tc.campus_slug
    and lower(btrim(existing.name))=lower(btrim(c.name))
);

-- Promote the official source references into name/service provenance only.
-- source_url is cleared where it was only supporting a name or service, not the exact point.
update public.campus_map_features f
set
  source_url = case when f.latitude is null or f.longitude is null then null else f.source_url end,
  description = case
    when f.name='Laz Otti Memorial Library' then
      'Official Babcock Library listing identifies the central Laz Otti Memorial Library and places it directly opposite BUCODeL. Exact building footprint and public entrance pin still require campus confirmation.'
    when f.name='Babcock University Teaching Hospital' then
      'Official BUTH information lists a dedicated Emergency Department operating 24/7. The emergency contact is recorded below; the exact campus building and emergency entrance point still require campus confirmation.'
    when f.name='Amphitheatre' then
      'Official Babcock arrival information identifies the Amphitheatre for orientation and student support. The existing OpenStreetMap point is only a candidate and is not an official entrance coordinate.'
    when f.name='Registry' then
      'Official Babcock arrival information identifies the Registry as an arrival and verification service. Exact building and visitor entrance point require campus confirmation.'
    when f.name='Student Development' then
      'Official Babcock arrival information identifies Student Development in the hall-allocation and student-arrival process. Exact office point and entrance require campus confirmation.'
    when f.name='University Gate' then
      'Official Babcock arrival information identifies the University Gate as the Main Campus arrival point. Exact public gate pin and pedestrian entrance require campus confirmation.'
    when f.name='University Stadium' then
      'Official Babcock Sports Facilities page lists the Stadium. The existing community-mapped point remains an unverified candidate and must not be treated as an official entrance.'
    when f.name='Babcock Business School' then
      'Official Babcock event information identifies BBS Auditorium A. The existing community-mapped building point has not been matched to an exact official building footprint or entrance.'
    else f.description
  end,
  metadata = coalesce(f.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'name_source_url',case
      when f.name in ('Ameyo Adadevoh Hall','Queen Esther Hall','Winslow Hall') then 'https://www.babcock.edu.ng/residence/classic'
      when f.name in ('Havilah Gold Hall','Nelson Mandela Hall') then 'https://www.babcock.edu.ng/residence/premium'
      when f.name='Laz Otti Memorial Library' then 'https://www.babcock.edu.ng/library'
      when f.name='Babcock University Teaching Hospital' then 'https://buth.babcock.edu.ng/emergency-services/'
      when f.name='Amphitheatre' then 'https://www.babcock.edu.ng/new-students-info'
      when f.name in ('Registry','Student Development','University Gate') then 'https://www.babcock.edu.ng/new-students-info'
      else null end,
    'official_info_source_url',case
      when f.name='Laz Otti Memorial Library' then 'https://www.babcock.edu.ng/library'
      when f.name='Babcock University Teaching Hospital' then 'https://buth.babcock.edu.ng/emergency-services/'
      when f.name='University Stadium' then 'https://www.babcock.edu.ng/sports/facilities'
      when f.name='Babcock Business School' then 'https://www.babcock.edu.ng/spiritual-life/university-church'
      else null end,
    'candidate_origin','official_university_directory',
    'name_source_scope','official_name_or_service_only',
    'coordinate_note',case
      when f.latitude is null or f.longitude is null then 'No coordinates supplied. Confirm the exact building and entrance on campus before verification.'
      when f.metadata->>'coordinate_status'='candidate_unverified' then 'Coordinates are a community-mapped candidate only. The official source confirms the name or service, not this precise point.'
      else f.metadata->>'coordinate_note' end
  )) || case
    when f.name='Babcock University Teaching Hospital' then
      jsonb_build_object('emergency_phone','+234 811 891 8368','opening_hours','Emergency Department · 24/7')
    when f.name='Laz Otti Memorial Library' then
      jsonb_build_object('location_relationship_note','Official Library page: centrally located opposite BUCODeL. Opening hours vary by session and examination period; check the official Library page.')
    else '{}'::jsonb end,
  verification_status='pending',
  verified_by=null,
  verified_at=null,
  is_published=false,
  updated_at=now()
where f.university_id=(select university_id from public.campus_universities where slug='babcock-university' limit 1)
  and f.campus_slug='main-campus'
  and f.name in (
    'Ameyo Adadevoh Hall','Havilah Gold Hall','Queen Esther Hall','Nelson Mandela Hall','Winslow Hall',
    'Laz Otti Memorial Library','Babcock University Teaching Hospital','Amphitheatre',
    'Registry','Student Development','University Gate','University Stadium','Babcock Business School'
  );

commit;
