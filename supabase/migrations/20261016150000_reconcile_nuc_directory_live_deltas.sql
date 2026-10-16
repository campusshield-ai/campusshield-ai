-- Reconcile high-confidence roster discrepancies against the live NUC Nigerian University System
-- directory reviewed on 2026-10-16: https://enuc.nuc.edu.ng/nus
--
-- This is an additive, ID-preserving delta, not a wholesale roster replacement.
-- Existing slugs (and therefore referenced university IDs/relationships) are deliberately retained.
-- No university is deleted or deactivated by this migration. Full row-by-row review of all 328
-- records remains a pre-launch requirement; do not treat this delta alone as complete certification.

begin;

update public.campus_universities as u
set name = v.name,
    ownership = v.ownership,
    state = v.state,
    source_url = 'https://enuc.nuc.edu.ng/nus',
    is_active = true,
    updated_at = now()
from (values
  ('federal-university-gashua-yobe', 'Federal University, Gashua, Yobe', 'Federal', 'Yobe'),
  ('federal-university-dutsin-ma-katsina', 'Federal University, Dutsin-Ma, Katsina State', 'Federal', 'Katsina'),
  ('federal-university-otuoke-bayelsa', 'Federal University, Otuoke, Bayelsa', 'Federal', 'Bayelsa'),
  ('federal-university-gusau-zamfara', 'Federal University, Gusau, Zamfara', 'Federal', 'Zamfara'),
  ('jigawa-state-university-of-medical-and-allied-health-sciences-majia', 'Jigawa State University of Allied and Medical Science, Majia', 'State', 'Jigawa'),
  ('city-university-abuja', 'City University, Abuja', 'Private', 'FCT Abuja'),
  ('millenium-crest-university-ikare-akoko-ondo-state', 'Millennium Crest University, Ikare-Akoko, Ondo State', 'Private', 'Ondo'),
  ('transatlantic-university-of-medine-and-health-sciences-umuchukwu-anambra-state', 'Transatlantic University of Medicine and Health Sciences, Umuchukwu, Anambra State', 'Private', 'Anambra'),
  ('baba-ahmed-university-kano-state', 'Baba-Ahmed University, Kano, Kano State', 'Private', 'Kano'),
  ('modibbo-adama-university', 'Modibbo Adama University, Yola', 'Federal', 'Adamawa'),
  ('michael-okpara-university', 'Michael Okpara University of Agriculture, Umudike', 'Federal', 'Abia'),
  ('federal-university-of-health-sciences-katsina', 'Federal University of Health Sciences, Funtua, Katsina State', 'Federal', 'Katsina'),
  ('federal-university-of-agriculture-and-developmental-studies-iragbuji-osun-state', 'Federal University of Agriculture and Developmental Studies, Iragbiji, Osun State', 'Federal', 'Osun'),
  ('federal-university-of-agriculture-and-technology-okeho-oyo-state', 'Federal University of Agriculture and Technology, Okeho, Oyo State', 'Federal', 'Oyo'),
  ('cross-river-university-of-education-and-entrepeneurship-akampa-cross-river-state', 'Cross River University of Education and Entrepreneurship, Akampa, Cross River State', 'State', 'Cross River'),
  ('university-of-aeronautics-and-aerospace-engineering-ezza-ebonyi-state', 'Ebonyi State University of Aeronautics and Aerospace Engineering, Ezza, Ebonyi State', 'State', 'Ebonyi')
) as v(slug, name, ownership, state)
where u.slug = v.slug;

-- The live NUC listing contains Mewar University, Masaka, Nasarawa State,
-- which is absent from the 2026-09-05 seed snapshot. Add by stable slug; never replace IDs.
insert into public.campus_universities
  (name, slug, ownership, state, source_url, official_website, is_active)
values
  ('Mewar University, Masaka, Nasarawa State', 'mewar-university-masaka-nasarawa-state',
   'Private', 'Nasarawa', 'https://enuc.nuc.edu.ng/nus', null, true)
on conflict (slug) do update
set name = excluded.name,
    ownership = excluded.ownership,
    state = excluded.state,
    source_url = excluded.source_url,
    is_active = true,
    updated_at = now();

-- Fail loudly rather than silently pass if a target slug was absent from the baseline seed.
do $$
declare
  expected_count integer := 16;
  updated_count integer;
begin
  select count(*) into updated_count
  from public.campus_universities
  where slug in (
    'federal-university-gashua-yobe',
    'federal-university-dutsin-ma-katsina',
    'federal-university-otuoke-bayelsa',
    'federal-university-gusau-zamfara',
    'jigawa-state-university-of-medical-and-allied-health-sciences-majia',
    'city-university-abuja',
    'millenium-crest-university-ikare-akoko-ondo-state',
    'transatlantic-university-of-medine-and-health-sciences-umuchukwu-anambra-state',
    'baba-ahmed-university-kano-state',
    'modibbo-adama-university',
    'michael-okpara-university',
    'federal-university-of-health-sciences-katsina',
    'federal-university-of-agriculture-and-developmental-studies-iragbuji-osun-state',
    'federal-university-of-agriculture-and-technology-okeho-oyo-state',
    'cross-river-university-of-education-and-entrepeneurship-akampa-cross-river-state',
    'university-of-aeronautics-and-aerospace-engineering-ezza-ebonyi-state'
  );

  if updated_count <> expected_count then
    raise exception 'NUC roster delta expected % existing slugs, found %; review baseline before applying', expected_count, updated_count;
  end if;
end $$;

commit;
