-- Make every unpublished Babcock Main Campus feature explicit about point confidence.
-- Official name links are not point evidence. Only an exact, campus-approved source can populate source_url.
begin;

update public.campus_map_features f
set
  source_url = null,
  metadata = coalesce(f.metadata,'{}'::jsonb) || jsonb_build_object(
    'coordinate_status',case
      when f.latitude is null and f.longitude is null then 'missing'
      else 'candidate_unverified'
    end,
    'coordinate_note',case
      when f.latitude is null and f.longitude is null then
        'No coordinates supplied. Official sources support the name or service only; confirm the exact building, public entrance and any accessible approach on campus.'
      else
        'Coordinates are a community-mapped candidate only. They are not university-certified or confirmed as a public entrance or accessible entrance. Verify against an approved campus plan or on-campus GPS survey.'
    end
  ),
  updated_at=now()
from public.campus_universities u
where f.university_id=u.id
  and u.slug='babcock-university'
  and f.campus_slug='main-campus'
  and f.verification_status='pending'
  and f.is_published=false;

commit;
