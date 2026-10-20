-- Defense in depth: the database itself binds each crawler source to the campus's registered official hostname.
drop policy if exists campus_knowledge_sources_admin_insert on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_insert
on public.campus_knowledge_sources for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and created_by = (select auth.uid())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid()) and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin' and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_universities u
    where u.id = campus_knowledge_sources.university_id
      and (
        (u.official_website is not null and lower(split_part(split_part(u.official_website, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain))
        or
        (u.source_url is not null and lower(split_part(split_part(u.source_url, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain))
      )
  )
  and base_url ~ '^https://'
  and lower(split_part(split_part(base_url, '://', 2), '/', 1)) = lower(domain)
  and (split_part(split_part(base_url, '://', 2), '/', 1) not like '%:%')
);

drop policy if exists campus_knowledge_sources_admin_update on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_update
on public.campus_knowledge_sources for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid()) and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin' and m.membership_status = 'active' and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid()) and m.university_id = campus_knowledge_sources.university_id
      and m.campus_role = 'admin' and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_universities u
    where u.id = campus_knowledge_sources.university_id
      and (
        (u.official_website is not null and lower(split_part(split_part(u.official_website, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain))
        or
        (u.source_url is not null and lower(split_part(split_part(u.source_url, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain))
      )
  )
  and base_url ~ '^https://'
  and lower(split_part(split_part(base_url, '://', 2), '/', 1)) = lower(domain)
  and (split_part(split_part(base_url, '://', 2), '/', 1) not like '%:%')
);

-- Use exact hostname comparisons rather than regex interpolation of a domain name.
drop policy if exists campus_knowledge_pages_admin_insert on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_insert
on public.campus_knowledge_pages for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_knowledge_sources s where s.id = campus_knowledge_pages.source_id
      and s.university_id = campus_knowledge_pages.university_id and s.status = 'approved'
      and lower(split_part(split_part(campus_knowledge_pages.url, '://', 2), '/', 1)) = lower(s.domain)
      and campus_knowledge_pages.url ~ '^https://'
  )
);

drop policy if exists campus_knowledge_pages_admin_update on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_update
on public.campus_knowledge_pages for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_knowledge_sources s where s.id = campus_knowledge_pages.source_id
      and s.university_id = campus_knowledge_pages.university_id and s.status = 'approved'
      and lower(split_part(split_part(campus_knowledge_pages.url, '://', 2), '/', 1)) = lower(s.domain)
      and campus_knowledge_pages.url ~ '^https://'
  )
);
