-- Correct high-confidence name spelling/location variants from the current NUC NUS table.
-- Updates existing rows by stable slug only; no IDs, slugs, memberships or campus relationships change.
-- Conflicting NUC names and ambiguous aliases are intentionally excluded for manual review.
begin;

update public.campus_universities as u
set name = v.name,
    source_url = 'https://enuc.nuc.edu.ng/nus',
    updated_at = now()
from (values
  ('abdulsalam-abubakar-university-of-agriculture-and-climate-action-mokwa-niger-state', 'Abdulsalami Abubakar University of Agriculture and Climate Action, Mokwa, Niger State'),
  ('arthur-javis-university-akpoyubo-cross-river-state', 'Arthur Jarvis University, Akpabuyo, Cross River State'),
  ('british-canadian-university-obufu-cross-river-state', 'British Canadian University, Obudu, Cross River State'),
  ('federal-university-of-agriculture-bassam-biri-bayelsa', 'Federal University of Agriculture, Bassam-Bari, Bayelsa'),
  ('gerar-university-of-medical-science-imope-ijebu-ogun-state', 'Gerar University of Medical Sciences, Imope-Ijebu, Ogun State'),
  ('huda-university-gusau-zamafara-state', 'Huda University, Gusau, Zamfara State'),
  ('hillside-university-of-science-and-technology-okemisi-ekiti-state', 'Hillside University of Science and Technology, Okemesi Ekiti, Ekiti State'),
  ('lighthouse-university-evbobanosa-edo-state', 'Lighthouse University, Evbuobanosa, Edo State'),
  ('tonine-iredia-university-of-communication-benin-city-edo-state', 'Tonnie Iredia University of Communication, Benin City, Edo State'),
  ('umar-musa-yar-adua-university-katsina', 'Umaru Musa Yar’Adua University, Katsina'),
  ('west-midlands-open-university-ibadan-oyo-state', 'West Midland Open University, Ibadan, Oyo State'),
  ('nigerian-maritime-university-okerenkoko-delta-state', 'Nigeria Maritime University Okerenkoko, Delta State'),
  ('alex-ekwueme-university-ndufu-alike-ebonyi-state', 'Alex Ekwueme Federal University, Ndufu Alike, Ebonyi State'),
  ('state-university-of-medical-and-applied-sciences-igbo-eno-enugu', 'Enugu State University of Medical and Applied Sciences, Igbo-Eno, Enugu State'),
  ('eko-university-of-medical-and-health-sciences-ijanikin-lagos', 'Eko University of Medical Sciences, Ijanikin, Lagos')
) as v(slug, name)
where u.slug = v.slug;

do $$
declare
  expected_count integer := 15;
  updated_count integer;
begin
  select count(*) into updated_count
  from public.campus_universities
  where slug in (
    'abdulsalam-abubakar-university-of-agriculture-and-climate-action-mokwa-niger-state',
    'arthur-javis-university-akpoyubo-cross-river-state',
    'british-canadian-university-obufu-cross-river-state',
    'federal-university-of-agriculture-bassam-biri-bayelsa',
    'gerar-university-of-medical-science-imope-ijebu-ogun-state',
    'huda-university-gusau-zamafara-state',
    'hillside-university-of-science-and-technology-okemisi-ekiti-state',
    'lighthouse-university-evbobanosa-edo-state',
    'tonine-iredia-university-of-communication-benin-city-edo-state',
    'umar-musa-yar-adua-university-katsina',
    'west-midlands-open-university-ibadan-oyo-state',
    'nigerian-maritime-university-okerenkoko-delta-state',
    'alex-ekwueme-university-ndufu-alike-ebonyi-state',
    'state-university-of-medical-and-applied-sciences-igbo-eno-enugu',
    'eko-university-of-medical-and-health-sciences-ijanikin-lagos'
  );

  if updated_count <> expected_count then
    raise exception 'NUC name delta expected % existing slugs, found %; review before applying', expected_count, updated_count;
  end if;
end $$;

commit;
