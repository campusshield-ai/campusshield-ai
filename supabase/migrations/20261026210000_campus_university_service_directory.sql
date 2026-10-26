-- Verified service directory for all active Nigerian universities.
-- Office-specific contacts are populated only from official institutional sources.
-- The National Universities Commission lists 77 federal, 69 state, and 182 private universities.

do $$
declare
  v_babcock_id uuid;
  v_babcoook_id uuid;
begin
  select id into v_babcock_id
  from public.campus_universities
  where slug = 'babcock-university' and ownership = 'Private'
  order by is_active desc, created_at asc
  limit 1;

  select id into v_babcoook_id
  from public.campus_universities
  where lower(btrim(name)) = 'babcook university' and ownership = 'Federal'
  order by created_at asc
  limit 1;

  if v_babcock_id is not null and v_babcoook_id is not null and v_babcock_id <> v_babcoook_id then
    -- Preserve user membership: if the user already has the correct campus membership,
    -- retain that row; otherwise reassign the legacy typo membership.
    delete from public.campus_memberships wrong
    using public.campus_memberships correct
    where wrong.user_id = correct.user_id
      and wrong.university_id = v_babcoook_id
      and correct.university_id = v_babcock_id;

    update public.campus_memberships
    set university_id = v_babcock_id, updated_at = now()
    where university_id = v_babcoook_id;

    -- Preserve the conversation record and its university scope while correcting the
    -- typo in the campus directory.
    update public.campus_chat_messages
    set university_id = v_babcock_id
    where university_id = v_babcoook_id;

    update public.campus_universities
    set is_active = false, updated_at = now()
    where id = v_babcoook_id;
  end if;
end $$;

-- Add only a homepage supported by an official institutional source already identified in
-- this migration. Other universities remain linked to the NUC listing until their
-- homepage is independently verified; never infer domains from university names.
update public.campus_universities
set official_website = 'https://fumhsf.edu.ng/',
    updated_at = now()
where lower(btrim(name)) = 'federal university of health sciences, funtua, katsina state'
  and is_active = true
  and nullif(btrim(official_website), '') is null;

create table if not exists public.campus_university_service_directory (
  university_id uuid primary key references public.campus_universities(id) on delete cascade,
  medical_services_url text,
  medical_phone text,
  medical_email text,
  medical_source_url text,
  student_affairs_url text,
  student_affairs_phone text,
  student_affairs_email text,
  student_affairs_source_url text,
  registrar_url text,
  registrar_phone text,
  registrar_email text,
  registrar_source_url text,
  source_directory_url text not null default 'https://enuc.nuc.edu.ng/nus',
  data_status text not null default 'official_homepage_only'
    check (data_status in ('official_office_pages_verified','official_homepage_only','nuc_listing_only')),
  last_verified_at timestamptz,
  notes text not null default 'Office-specific links and contact details are included only where verified on official university pages. A blank contact field means the detail has not been verified in this directory.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campus_service_directory_status_idx
  on public.campus_university_service_directory (data_status);

alter table public.campus_university_service_directory enable row level security;

drop policy if exists campus_service_directory_read_active on public.campus_university_service_directory;
create policy campus_service_directory_read_active
  on public.campus_university_service_directory
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.campus_universities u
      where u.id = campus_university_service_directory.university_id
        and u.is_active = true
    )
  );

grant select on public.campus_university_service_directory to anon, authenticated;

insert into public.campus_university_service_directory (university_id, source_directory_url, data_status)
select
  u.id,
  case
    when u.ownership = 'Federal' then 'https://www.nuc.edu.ng/federal-univeristies/'
    when u.ownership = 'State' then 'https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/'
    else 'https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/'
  end,
  case
    when nullif(btrim(u.official_website), '') is not null then 'official_homepage_only'
    else 'nuc_listing_only'
  end
from public.campus_universities u
where u.is_active = true
on conflict (university_id) do nothing;

update public.campus_university_service_directory d
set data_status = 'official_homepage_only', updated_at = now()
from public.campus_universities u
where u.id = d.university_id and u.is_active = true
  and nullif(btrim(u.official_website), '') is not null
  and d.data_status = 'nuc_listing_only';

-- Office links and contact details below come from official institutional websites
-- or current official university publications. No numbers are inferred.
with verified(
  university_name,
  medical_services_url, medical_phone, medical_email, medical_source_url,
  student_affairs_url, student_affairs_phone, student_affairs_email, student_affairs_source_url,
  registrar_url, registrar_phone, registrar_email, registrar_source_url
) as (values
  ('Babcock University, Ilishan-Remo',
   null, null, null, 'https://babcock.edu.ng/contact',
   null, null, null, 'https://babcock.edu.ng/contact',
   'https://www.babcock.edu.ng/registry', null, null, 'https://www.babcock.edu.ng/registry'),
  ('University of Lagos',
   'https://unilag.edu.ng/leadership-officers-and-dean/', null, null, 'https://unilag.edu.ng/leadership-officers-and-dean/',
   'https://unilag.edu.ng/leadership-officers-and-dean/', null, 'dsa@unilag.edu.ng', 'https://unilag.edu.ng/leadership-officers-and-dean/',
   'https://unilag.edu.ng/registry/', null, null, 'https://unilag.edu.ng/office-of-the-registrar-staff/'),
  ('University of Ibadan',
   'https://ui.edu.ng/content/health-services', null, null, 'https://ui.edu.ng/content/health-services',
   'https://registry.ui.edu.ng/welcome', null, null, 'https://registry.ui.edu.ng/welcome',
   'https://registry.ui.edu.ng/welcome', null, 'registrar@ui.edu.ng', 'https://registry.ui.edu.ng/welcome'),
  ('Ahmadu Bello University, Zaria',
   'https://abu.edu.ng/wp-content/uploads/2026/06/ABU-Student-Handbook-for-the-2025-2026-Session.pdf',
   '08035801064; 08028190599', null,
   'https://abu.edu.ng/wp-content/uploads/2026/06/ABU-Student-Handbook-for-the-2025-2026-Session.pdf',
   'https://abu.edu.ng/wp-content/uploads/2026/06/ABU-Student-Handbook-for-the-2025-2026-Session.pdf',
   null, null, 'https://abu.edu.ng/wp-content/uploads/2026/06/ABU-Student-Handbook-for-the-2025-2026-Session.pdf',
   null, null, null, 'https://abu.edu.ng/wp-content/uploads/2026/06/ABU-Student-Handbook-for-the-2025-2026-Session.pdf'),
  ('Federal University of Health Sciences, Funtua, Katsina State',
   'https://fumhsf.edu.ng/administration/management', null, null, 'https://fumhsf.edu.ng/administration/management',
   'https://fumhsf.edu.ng/administration/management', null, null, 'https://fumhsf.edu.ng/administration/management',
   'https://fumhsf.edu.ng/administration/management', null, 'registrar@fumhsf.edu.ng', 'https://fumhsf.edu.ng/administration/management'),
  ('University of Ilorin',
   'https://www.unilorin.edu.ng/support-services/', '+234 805 087 8080', null, 'https://www.unilorin.edu.ng/support-services/',
   'https://www.unilorin.edu.ng/support-services/', null, null, 'https://www.unilorin.edu.ng/support-services/',
   'https://www.unilorin.edu.ng/support-services/', '+234 805 087 8080', 'registrar@unilorin.edu.ng', 'https://www.unilorin.edu.ng/support-services/'),
  ('University of Nigeria, Nsukka',
   'https://www.unn.edu.ng/site-map/', null, null, 'https://www.unn.edu.ng/site-map/',
   'https://www.unn.edu.ng/site-map/', null, null, 'https://www.unn.edu.ng/site-map/',
   'https://www.unn.edu.ng/site-map/', null, null, 'https://www.unn.edu.ng/site-map/'),
  ('Federal University, Birnin Kebbi',
   'https://www.fubk.edu.ng/governance/', null, null, 'https://www.fubk.edu.ng/governance/',
   'https://www.fubk.edu.ng/governance/', null, null, 'https://www.fubk.edu.ng/governance/',
   'https://www.fubk.edu.ng/governance/', null, null, 'https://www.fubk.edu.ng/governance/')
)
insert into public.campus_university_service_directory (
  university_id, medical_services_url, medical_phone, medical_email, medical_source_url,
  student_affairs_url, student_affairs_phone, student_affairs_email, student_affairs_source_url,
  registrar_url, registrar_phone, registrar_email, registrar_source_url,
  data_status, last_verified_at, updated_at
)
select
  u.id, v.medical_services_url, v.medical_phone, v.medical_email, v.medical_source_url,
  v.student_affairs_url, v.student_affairs_phone, v.student_affairs_email, v.student_affairs_source_url,
  v.registrar_url, v.registrar_phone, v.registrar_email, v.registrar_source_url,
  'official_office_pages_verified', now(), now()
from verified v
join public.campus_universities u on lower(btrim(u.name)) = lower(btrim(v.university_name))
where u.is_active = true
on conflict (university_id) do update set
  medical_services_url = coalesce(excluded.medical_services_url, campus_university_service_directory.medical_services_url),
  medical_phone = coalesce(excluded.medical_phone, campus_university_service_directory.medical_phone),
  medical_email = coalesce(excluded.medical_email, campus_university_service_directory.medical_email),
  medical_source_url = coalesce(excluded.medical_source_url, campus_university_service_directory.medical_source_url),
  student_affairs_url = coalesce(excluded.student_affairs_url, campus_university_service_directory.student_affairs_url),
  student_affairs_phone = coalesce(excluded.student_affairs_phone, campus_university_service_directory.student_affairs_phone),
  student_affairs_email = coalesce(excluded.student_affairs_email, campus_university_service_directory.student_affairs_email),
  student_affairs_source_url = coalesce(excluded.student_affairs_source_url, campus_university_service_directory.student_affairs_source_url),
  registrar_url = coalesce(excluded.registrar_url, campus_university_service_directory.registrar_url),
  registrar_phone = coalesce(excluded.registrar_phone, campus_university_service_directory.registrar_phone),
  registrar_email = coalesce(excluded.registrar_email, campus_university_service_directory.registrar_email),
  registrar_source_url = coalesce(excluded.registrar_source_url, campus_university_service_directory.registrar_source_url),
  data_status = 'official_office_pages_verified',
  last_verified_at = now(),
  updated_at = now();
