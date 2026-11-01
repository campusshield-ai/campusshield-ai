-- Babcock Main Campus community-mapped POI candidates.
-- These are OSM-derived data candidates, not university-certified locations.
-- All inserted points remain pending and unpublished until an authorized campus administrator verifies them.
WITH target AS (
  SELECT university_id
  FROM public.campus_map_features
  WHERE campus_slug = 'main-campus'
    AND name = 'Amphitheatre'
  ORDER BY created_at
  LIMIT 1
),
candidates(name, feature_type, latitude, longitude, osm_id, source_url) AS (
  VALUES
    ('BBS Babcock Business School','building',6.89082,3.72391,'11750260583','https://mapcarta.com/N11750260583'),
    ('BUSA House','facility',6.89205,3.72376,'11750260577','https://mapcarta.com/N11750260577'),
    ('Bursary','facility',6.89010,3.72289,'11750260570','https://mapcarta.com/N11750260570'),
    ('Nelson Mandela Hall','hostel',6.89347,3.72304,'11750260574','https://mapcarta.com/N11750260574'),
    ('Winslow Hall','hostel',6.89401,3.72166,'11750228864','https://mapcarta.com/N11750228864'),
    ('Ameyo Adadevoh Hall','hostel',6.89495,3.72493,'11750293373','https://mapcarta.com/N11750293373'),
    ('Havilah Gold Hall','hostel',6.89488,3.72608,'11750293374','https://mapcarta.com/N11750293374'),
    ('Queen Esther Hall','hostel',6.89298,3.72470,'11750260575','https://mapcarta.com/N11750260575'),
    ('School Cafeteria','cafeteria',6.89268,3.72361,'11750211718','https://mapcarta.com/N11750211718'),
    ('Science and Technology','building',6.88872,3.72255,'11750260584','https://mapcarta.com/N11750260584')
)
INSERT INTO public.campus_map_features (
  university_id, campus_name, campus_slug, feature_type, name, description,
  latitude, longitude, source_url, verification_status, is_published, metadata
)
SELECT
  target.university_id,
  'Main Campus',
  'main-campus',
  candidates.feature_type,
  candidates.name,
  'Community-mapped OpenStreetMap candidate. Confirm the exact building/entrance on campus before verification or publication.',
  candidates.latitude,
  candidates.longitude,
  NULL,
  'pending',
  false,
  jsonb_build_object(
    'coordinate_source_label','OpenStreetMap node via Mapcarta',
    'coordinate_source_url',candidates.source_url,
    'coordinate_source_type','OpenStreetMap node',
    'coordinate_osm_id',candidates.osm_id,
    'coordinate_status','candidate_unverified',
    'coordinate_note','Community-mapped candidate point only. Not university-certified and not independently verified for an entrance or building footprint.',
    'name_source_url',candidates.source_url
  )
FROM candidates
CROSS JOIN target
WHERE NOT EXISTS (
  SELECT 1
  FROM public.campus_map_features existing
  WHERE existing.university_id = target.university_id
    AND existing.campus_slug = 'main-campus'
    AND lower(existing.name) = lower(candidates.name)
);
