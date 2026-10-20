-- Restrict indexed pages to the approved source registered for the same university.
drop policy if exists campus_knowledge_pages_admin_insert on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_insert
on public.campus_knowledge_pages for insert to authenticated
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_knowledge_sources s
    where s.id = campus_knowledge_pages.source_id
      and s.university_id = campus_knowledge_pages.university_id
      and s.status = 'approved'
      and campus_knowledge_pages.url ~ ('^https://' || s.domain || '(/|$)')
  )
);

drop policy if exists campus_knowledge_pages_admin_update on public.campus_knowledge_pages;
create policy campus_knowledge_pages_admin_update
on public.campus_knowledge_pages for update to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
)
with check (
  university_id = (select private.current_campus_university_id())
  and (select private.current_campus_role()) = 'admin'
  and exists (
    select 1 from public.campus_memberships m
    where m.user_id = (select auth.uid())
      and m.university_id = campus_knowledge_pages.university_id
      and m.campus_role = 'admin'
      and m.membership_status = 'active'
      and m.verification_status = 'verified'
  )
  and exists (
    select 1 from public.campus_knowledge_sources s
    where s.id = campus_knowledge_pages.source_id
      and s.university_id = campus_knowledge_pages.university_id
      and s.status = 'approved'
      and campus_knowledge_pages.url ~ ('^https://' || s.domain || '(/|$)')
  )
);
