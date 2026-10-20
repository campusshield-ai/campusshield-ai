-- Do not treat the NUC directory URL as a university's official website.
drop policy if exists campus_knowledge_sources_admin_insert on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_insert
on public.campus_knowledge_sources for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and created_by = (select auth.uid())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_universities u where u.id = campus_knowledge_sources.university_id
      and u.official_website is not null
      and lower(split_part(split_part(u.official_website, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain)
  )
  and base_url ~ '^https://'
  and lower(split_part(split_part(base_url, '://', 2), '/', 1)) = lower(domain)
  and split_part(split_part(base_url, '://', 2), '/', 1) not like '%:%'
);

drop policy if exists campus_knowledge_sources_admin_update on public.campus_knowledge_sources;
create policy campus_knowledge_sources_admin_update
on public.campus_knowledge_sources for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_sources.university_id and m.campus_role = 'admin'
      and m.membership_status = 'active' and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_universities u where u.id = campus_knowledge_sources.university_id
      and u.official_website is not null
      and lower(split_part(split_part(u.official_website, '://', 2), '/', 1)) = lower(campus_knowledge_sources.domain)
  )
  and base_url ~ '^https://'
  and lower(split_part(split_part(base_url, '://', 2), '/', 1)) = lower(domain)
  and split_part(split_part(base_url, '://', 2), '/', 1) not like '%:%'
);
