-- The current NUC NUS table uses the name "Mewar University", while the NUC private-
-- universities directory and the institution's own website use "Mewar International University".
-- The baseline already contains the latter. This is an unresolved official-source naming conflict,
-- not a confirmed separate institution. Keep the alternate row and its ID for auditability but
-- inactive pending NUC clarification, so the selector does not present two active entries.
-- Abort if any campus or student data has begun referencing the alternate row.
begin;

do $$
declare
  duplicate_id uuid;
  canonical_id uuid;
begin
  select id into duplicate_id
  from public.campus_universities
  where slug = 'mewar-university-masaka-nasarawa-state'
  for update;

  select id into canonical_id
  from public.campus_universities
  where slug = 'mewar-international-university-masaka-nasarawa-state'
    and is_active
  for update;

  if duplicate_id is null then
    raise exception 'Expected inactive Mewar alias candidate row was not found';
  end if;

  if canonical_id is null then
    raise exception 'Active Mewar International University canonical row was not found';
  end if;

  if exists (select 1 from public.campus_events where university_id = duplicate_id)
     or exists (select 1 from public.campus_follows where university_id = duplicate_id)
     or exists (select 1 from public.campus_groups where university_id = duplicate_id)
     or exists (select 1 from public.campus_helpdesk_ticket_updates where university_id = duplicate_id)
     or exists (select 1 from public.campus_helpdesk_tickets where university_id = duplicate_id)
     or exists (select 1 from public.campus_marketplace_listings where university_id = duplicate_id)
     or exists (select 1 from public.campus_marketplace_reports where university_id = duplicate_id)
     or exists (select 1 from public.campus_memberships where university_id = duplicate_id)
     or exists (select 1 from public.campus_notices where university_id = duplicate_id)
     or exists (select 1 from public.community_poll_options where university_id = duplicate_id)
     or exists (select 1 from public.community_poll_votes where university_id = duplicate_id)
     or exists (select 1 from public.community_post_media where university_id = duplicate_id)
     or exists (select 1 from public.community_posts where university_id = duplicate_id)
     or exists (select 1 from public.incidents where university_id = duplicate_id)
     or exists (select 1 from public.student_identity_verifications where university_id = duplicate_id) then
    raise exception 'Mewar University alias candidate is referenced; review and migrate references instead of deactivating';
  end if;

  update public.campus_universities
  set is_active = false,
      source_url = 'https://enuc.nuc.edu.ng/nus',
      updated_at = now()
  where id = duplicate_id;
end $$;

commit;
