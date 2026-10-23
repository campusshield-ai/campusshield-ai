-- Align high-confidence unmatched records to the live NUC NUS display names.
-- Manual review found the same institution, ownership and state for each row below.
-- Updates display names only by stable slug; no IDs, slugs, ownership, state, memberships or campus links change.
-- Known NUC source conflicts and location/identity ambiguities are intentionally excluded.
begin;

update public.campus_universities as u
set name = v.name,
    source_url = 'https://enuc.nuc.edu.ng/nus',
    updated_at = now()
from (values
  ('ekiti-state-university', 'Ekiti State University, Ado-Ekiti. (formerly University of Ado-Ekiti)'),
  ('pan-atlantic-university', 'Pan-Atlantic University, Lekki-Express Way, Lagos State'),
  ('bayelsa-medical-university', 'Bayelsa Medical University Yenagoa, Bayelsa State'),
  ('crescent-university', 'Crescent University, Abeokuta, Ogun State'),
  ('baze-university', 'Baze University, FCT Abuja'),
  ('glorious-vision-university-ogwa-edo-state', 'Glorious Vision University (formerly Samuel Adegboyega University), Ogwa, Edo State'),
  ('evangel-university-akaeze', 'Evangel University, Akaeze, Ebonyi State'),
  ('augustine-university', 'Augustine University, Ilara, Lagos State'),
  ('chrisland-university', 'Chrisland University, Owode, Ogun State'),
  ('micheal-cecilia-ibru-university', 'Michael & Cecilia Ibru University, Owhode, Delta State'),
  ('mountain-top-university', 'Mountain Top University, Makogi/Oba, Ogun State'),
  ('ojaja-university-eiyenkorin-kwara-state', 'Ojaja University, Eiyenkorin, Kwara State (formerly Crown-Hill University)'),
  ('precious-cornerstone-university-oyo', 'Precious Cornerstone, Ibadan, Oyo State'),
  ('skyline-university-kano', 'Skyline University, Nigeria, Kano, Kano State'),
  ('khalifa-isiyaku-rabiu-university-kano', 'Khalifa Isiyaku Rabiu University, Gadon /Kaya City Gate Kano, Kano State'),
  ('rayhaan-university-kebbi', 'Rayhaan University, Birnin Kebbi, Kebbi State'),
  ('wesley-university-ondo', 'Wesley University of Science & Technology, Ondo State')
) as v(slug, name)
where u.slug = v.slug;

do $$
declare
  expected_count integer := 17;
  updated_count integer;
begin
  select count(*) into updated_count
  from public.campus_universities
  where slug in (
    'ekiti-state-university',
    'pan-atlantic-university',
    'bayelsa-medical-university',
    'crescent-university',
    'baze-university',
    'glorious-vision-university-ogwa-edo-state',
    'evangel-university-akaeze',
    'augustine-university',
    'chrisland-university',
    'micheal-cecilia-ibru-university',
    'mountain-top-university',
    'ojaja-university-eiyenkorin-kwara-state',
    'precious-cornerstone-university-oyo',
    'skyline-university-kano',
    'khalifa-isiyaku-rabiu-university-kano',
    'rayhaan-university-kebbi',
    'wesley-university-ondo'
  );

  if updated_count <> expected_count then
    raise exception 'NUC manual name delta expected % existing slugs, found %; review before applying', expected_count, updated_count;
  end if;
end $$;

commit;
