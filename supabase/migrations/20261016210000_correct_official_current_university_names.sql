-- Correct two malformed/outdated display names using the institutions' current official sources.
-- Stable slugs/IDs, ownership, state, activity, memberships and campus relationships are preserved.
-- The live NUC NUS table currently shows older/different names for these same institutions; that source conflict is documented, not hidden.
begin;

update public.campus_universities
set name = 'Kashim Ibrahim University, Maiduguri, Borno State',
    source_url = 'https://www.kiu.edu.ng/',
    official_website = 'https://www.kiu.edu.ng/',
    updated_at = now()
where slug = 'kashim-ibrahim-formerly-bornu-state-university-maiduguri';

update public.campus_universities
set name = 'Elrazi Medical University, Kano',
    source_url = 'https://www.elrazi.edu.ng/',
    official_website = 'https://www.elrazi.edu.ng/',
    updated_at = now()
where slug = 'elrazi-medical-university-yargaya-university-kano-state';

do $$
begin
  if (select count(*) from public.campus_universities where slug in (
    'kashim-ibrahim-formerly-bornu-state-university-maiduguri',
    'elrazi-medical-university-yargaya-university-kano-state'
  )) <> 2 then
    raise exception 'Expected exactly two existing official-name correction targets';
  end if;
end $$;

commit;
