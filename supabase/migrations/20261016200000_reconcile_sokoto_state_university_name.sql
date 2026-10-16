-- Exact institution identity confirmed: align Sokoto State University display name with live NUC NUS.
-- Updates name only by stable slug; ownership, state, ID, slug and relationships remain unchanged.
begin;

update public.campus_universities
set name = 'Sokoto State University, Sokoto',
    source_url = 'https://enuc.nuc.edu.ng/nus',
    updated_at = now()
where slug = 'sokoto-state-university';

do $$
begin
  if (select count(*) from public.campus_universities where slug = 'sokoto-state-university') <> 1 then
    raise exception 'Expected exactly one existing Sokoto State University row';
  end if;
end $$;

commit;
