-- Remove name-only URLs from the exact-point evidence field on Babcock Main Campus.
-- Official name/service sources remain separately visible in metadata for admin review.
begin;

update public.campus_map_features f
set
  source_url = null,
  metadata = coalesce(f.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'coordinate_status',case
      when f.latitude is null or f.longitude is null then 'missing'
      else coalesce(f.metadata->>'coordinate_status','candidate_unverified')
    end,
    'coordinate_note',case
      when f.latitude is null or f.longitude is null then
        'Official source confirms the name or service only. Exact point, building entrance and physical-access details still require on-campus GPS or an approved survey.'
      else
        'Coordinates remain a community-mapped candidate only. Official source confirms the name or service, not this precise point or entrance. Obtain an approved campus plan or on-campus survey before verification.'
    end
  )),
  updated_at = now()
from public.campus_universities u
where f.university_id=u.id
  and u.slug='babcock-university'
  and f.campus_slug='main-campus'
  and f.verification_status='pending'
  and f.is_published=false
  and f.source_url is not null;

commit;
