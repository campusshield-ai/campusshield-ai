-- Correct a confirmed location/state discrepancy using the live NUC NUS table
-- and NUC's published private-university bulletin. Preserve the existing slug/ID and relationships.
begin;

update public.campus_universities
set name = 'Mercy Medical University, Iwara, Iwo, Osun State',
    state = 'Osun',
    source_url = 'https://enuc.nuc.edu.ng/nus',
    updated_at = now()
where slug = 'mercy-medical-university-iwo-ogun-state';

do $$
begin
  if not exists (
    select 1 from public.campus_universities
    where slug = 'mercy-medical-university-iwo-ogun-state'
      and name = 'Mercy Medical University, Iwara, Iwo, Osun State'
      and state = 'Osun'
      and ownership = 'Private'
  ) then
    raise exception 'Mercy Medical University NUC location correction did not apply as expected';
  end if;
end $$;

commit;
