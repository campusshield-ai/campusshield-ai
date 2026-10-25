-- Safe additive production parity for staff verification and identity-evidence audit.
-- Public RPCs are SECURITY INVOKER wrappers; privileged logic remains in private SECURITY DEFINER implementations.
-- Evidence audit rows are not directly client-readable. Quarantine Storage is private and has no browser access.
BEGIN;

GRANT USAGE ON SCHEMA private TO authenticated;


-- Private verification/audit structures missing from production.
CREATE TABLE IF NOT EXISTS public.campus_staff_verifications (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  position_title text NOT NULL CHECK (char_length(btrim(position_title)) BETWEEN 2 AND 120),
  staff_number text CHECK (staff_number IS NULL OR char_length(btrim(staff_number)) BETWEEN 2 AND 80),
  official_email text CHECK (official_email IS NULL OR (char_length(btrim(official_email)) BETWEEN 5 AND 254 AND position('@' IN official_email) > 1)),
  document_path text,
  requested_campus_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_staff_verification_evidence_check CHECK (document_path IS NOT NULL OR official_email IS NOT NULL OR staff_number IS NOT NULL),
  CONSTRAINT campus_staff_verification_path_check CHECK (document_path IS NULL OR document_path LIKE user_id::text || '/%')
);

CREATE TABLE IF NOT EXISTS public.campus_identity_evidence_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL CHECK (evidence_type IN ('student_id','staff_id','payment_receipt')),
  outcome text NOT NULL CHECK (outcome IN ('needs_review','institution_confirmed','not_confirmed')),
  source_kind text NOT NULL CHECK (source_kind IN ('document_visual_review','official_university_email','university_registry','direct_institution_contact','official_payment_portal','other')),
  source_reference text,
  reviewer_note text,
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_identity_evidence_confirmation_has_source CHECK (
    outcome <> 'institution_confirmed'
    OR (source_kind IN ('official_university_email','university_registry','direct_institution_contact','official_payment_portal')
        AND NULLIF(btrim(source_reference),'') IS NOT NULL)
  ),
  CONSTRAINT campus_identity_evidence_source_reference_length CHECK (
    source_reference IS NULL OR char_length(btrim(source_reference)) BETWEEN 1 AND 240
  ),
  CONSTRAINT campus_identity_evidence_reviewer_note_length CHECK (
    reviewer_note IS NULL OR char_length(btrim(reviewer_note)) <= 1000
  )
);

CREATE TABLE IF NOT EXISTS public.student_identity_upload_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('quarantined','scanning','clean','infected','scan_unavailable','error')),
  quarantine_path text,
  file_sha256 text,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 5242880),
  detected_mime text NOT NULL CHECK (detected_mime IN ('image/jpeg','image/png','application/pdf')),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_staff_verifications_queue_idx
  ON public.campus_staff_verifications (university_id, status, created_at);
CREATE INDEX IF NOT EXISTS campus_identity_evidence_checks_campus_time_idx
  ON public.campus_identity_evidence_checks (university_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS campus_identity_evidence_checks_campus_subject_time_idx
  ON public.campus_identity_evidence_checks (university_id, subject_user_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS student_identity_upload_scans_user_created_idx
  ON public.student_identity_upload_scans (user_id, created_at DESC);

ALTER TABLE public.campus_staff_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_identity_evidence_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_identity_upload_scans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.campus_staff_verifications FROM anon, authenticated;
GRANT SELECT ON TABLE public.campus_staff_verifications TO authenticated;
GRANT ALL ON TABLE public.campus_staff_verifications TO service_role;

REVOKE ALL ON TABLE public.campus_identity_evidence_checks FROM anon, authenticated;
GRANT ALL ON TABLE public.campus_identity_evidence_checks TO service_role;

REVOKE ALL ON TABLE public.student_identity_upload_scans FROM anon, authenticated;
GRANT SELECT ON TABLE public.student_identity_upload_scans TO authenticated;
GRANT ALL ON TABLE public.student_identity_upload_scans TO service_role;

DROP POLICY IF EXISTS campus_staff_verification_read_own ON public.campus_staff_verifications;
CREATE POLICY campus_staff_verification_read_own
ON public.campus_staff_verifications
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS student_identity_upload_scans_own_read ON public.student_identity_upload_scans;
CREATE POLICY student_identity_upload_scans_own_read
ON public.student_identity_upload_scans
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Evidence audit records have no direct client-side read or write policy.
-- Approved campus administrators use the guarded audit RPCs instead.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('campus-staff-documents', 'campus-staff-documents', false, 5242880, ARRAY['application/pdf','image/jpeg','image/png']::text[])
ON CONFLICT (id) DO UPDATE
  SET name=EXCLUDED.name, public=false, file_size_limit=EXCLUDED.file_size_limit,
      allowed_mime_types=EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-identity-quarantine', 'student-identity-quarantine', false, 5242880, ARRAY['image/jpeg','image/png','application/pdf']::text[])
ON CONFLICT (id) DO UPDATE
  SET name=EXCLUDED.name, public=false, file_size_limit=EXCLUDED.file_size_limit,
      allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION private.can_read_campus_staff_document(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.campus_staff_verifications v
    WHERE v.document_path = p_path
      AND v.university_id = (SELECT private.current_campus_university_id())
      AND (SELECT private.current_campus_role()) = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'admin'
          AND p.verification_status::text = 'verified'
      )
  );
$function$;
REVOKE ALL ON FUNCTION private.can_read_campus_staff_document(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_campus_staff_document(text) TO authenticated;

DROP POLICY IF EXISTS campus_staff_document_upload_own ON storage.objects;
CREATE POLICY campus_staff_document_upload_own
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campus-staff-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png')
);

DROP POLICY IF EXISTS campus_staff_document_read_owner_or_campus_admin ON storage.objects;
CREATE POLICY campus_staff_document_read_owner_or_campus_admin
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campus-staff-documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR private.can_read_campus_staff_document(name)
  )
);

DROP POLICY IF EXISTS campus_staff_document_delete_own_rejected ON storage.objects;
CREATE POLICY campus_staff_document_delete_own_rejected
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campus-staff-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (
    NOT EXISTS (SELECT 1 FROM public.campus_staff_verifications v WHERE v.document_path = objects.name)
    OR EXISTS (
      SELECT 1 FROM public.campus_staff_verifications v
      WHERE v.user_id = (SELECT auth.uid())
        AND v.document_path = objects.name
        AND v.status = 'rejected'
    )
  )
);

DROP POLICY IF EXISTS student_identity_quarantine_no_browser_access ON storage.objects;
CREATE POLICY student_identity_quarantine_no_browser_access
ON storage.objects FOR ALL TO anon, authenticated
USING (bucket_id = 'student-identity-quarantine' AND false)
WITH CHECK (bucket_id = 'student-identity-quarantine' AND false);



CREATE OR REPLACE FUNCTION private.record_campus_identity_evidence_check(p_subject_user_id uuid, p_evidence_type text, p_outcome text, p_source_kind text, p_source_reference text DEFAULT NULL::text, p_reviewer_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_check_id uuid;
begin
  if v_actor is null then raise exception 'Sign in is required.'; end if;
  if (select private.current_campus_role()) is distinct from 'admin'
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified campus administrator is required.';
  end if;
  if p_evidence_type not in ('student_id','staff_id','payment_receipt') then
    raise exception 'Unsupported evidence type.';
  end if;
  if p_outcome not in ('needs_review','institution_confirmed','not_confirmed') then
    raise exception 'Unsupported evidence outcome.';
  end if;
  if p_source_kind not in ('document_visual_review','official_university_email','university_registry','direct_institution_contact','official_payment_portal','other') then
    raise exception 'Unsupported evidence source.';
  end if;
  if p_source_reference is not null and length(btrim(p_source_reference)) not between 1 and 240 then
    raise exception 'Source reference must be 1–240 characters when supplied.';
  end if;
  if p_reviewer_note is not null and length(btrim(p_reviewer_note)) > 1000 then
    raise exception 'Reviewer note must not exceed 1000 characters.';
  end if;
  if p_outcome = 'institution_confirmed'
     and (p_source_kind not in ('official_university_email','university_registry','direct_institution_contact','official_payment_portal')
          or nullif(btrim(p_source_reference), '') is null) then
    raise exception 'Institution confirmation requires an authoritative source and traceable reference.';
  end if;
  if v_university_id is null or not private.user_has_current_campus(p_subject_user_id) then
    raise exception 'The account is not a member of your university.';
  end if;
  if p_evidence_type = 'student_id' and not exists (
    select 1 from public.student_identity_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No student identity submission exists for this account at your university.'; end if;
  if p_evidence_type = 'staff_id' and not exists (
    select 1 from public.campus_staff_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No staff verification submission exists for this account at your university.'; end if;
  if p_evidence_type = 'payment_receipt' and not exists (
    select 1 from public.student_identity_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) and not exists (
    select 1 from public.campus_staff_verifications s
    where s.user_id = p_subject_user_id and s.university_id = v_university_id
  ) then raise exception 'No related verification submission exists for this account at your university.'; end if;

  insert into public.campus_identity_evidence_checks
    (subject_user_id, university_id, evidence_type, outcome, source_kind, source_reference, reviewer_note, checked_by)
  values
    (p_subject_user_id, v_university_id, p_evidence_type, p_outcome, p_source_kind,
     nullif(btrim(p_source_reference), ''), nullif(btrim(p_reviewer_note), ''), v_actor)
  returning id into v_check_id;
  return v_check_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_campus_identity_evidence_check(
  p_subject_user_id uuid, p_evidence_type text, p_outcome text, p_source_kind text,
  p_source_reference text DEFAULT NULL::text, p_reviewer_note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT private.record_campus_identity_evidence_check(
    p_subject_user_id, p_evidence_type, p_outcome, p_source_kind, p_source_reference, p_reviewer_note
  );
$wrapper$;

REVOKE ALL ON FUNCTION private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) TO authenticated;


CREATE OR REPLACE FUNCTION private.bootstrap_first_campus_admin_impl(p_university_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_status text;
  v_existing_university uuid;
begin
  select p.role::text,p.verification_status::text
    into v_role,v_status
  from public.profiles p where p.id=v_user_id;

  if v_user_id is null or v_role is distinct from 'admin' or v_status is distinct from 'verified' then
    raise exception 'A verified CampusShield administrator is required.';
  end if;

  if not exists (
    select 1 from private.platform_admins pa where pa.user_id=v_user_id
  ) then
    raise exception 'Trusted platform administrator access must be provisioned by the database owner before campus setup.';
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id=p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  select cm.university_id into v_existing_university
  from public.campus_memberships cm where cm.user_id=v_user_id;

  if found and v_existing_university <> p_university_id then
    raise exception 'Your campus selection is locked. Use platform administration to assign a separate campus administrator.';
  end if;

  if exists (
    select 1 from public.campus_memberships cm
    where cm.university_id=p_university_id
      and cm.campus_role='admin'
      and cm.user_id<>v_user_id
      and cm.membership_status='active'
      and cm.verification_status='verified'
  ) then
    raise exception 'This university already has an approved campus administrator.';
  end if;

  insert into public.campus_memberships
    (user_id,university_id,campus_role,membership_status,verification_status)
  values
    (v_user_id,p_university_id,'admin','active','verified')
  on conflict(user_id) do update
    set campus_role='admin',
        membership_status='active',
        verification_status='verified',
        updated_at=now()
    where public.campus_memberships.university_id=excluded.university_id;

  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=v_user_id
      and cm.university_id=p_university_id
      and cm.campus_role='admin'
      and cm.membership_status='active'
      and cm.verification_status='verified'
  ) then
    raise exception 'Campus administrator setup failed; contact support.';
  end if;
  return true;
end;
$function$

CREATE OR REPLACE FUNCTION public.bootstrap_first_campus_admin(p_university_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.bootstrap_first_campus_admin_impl(p_university_id);
$wrapper$;
REVOKE ALL ON FUNCTION private.bootstrap_first_campus_admin_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bootstrap_first_campus_admin_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_first_campus_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_campus_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.list_campus_identity_evidence_checks_impl(p_subject_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, subject_user_id uuid, evidence_type text, outcome text, source_kind text, source_reference text, reviewer_note text, checked_by uuid, checked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if v_actor is null then raise exception 'Sign in is required.'; end if;
  if (select private.current_campus_role()) is distinct from 'admin'
     or not exists (select 1 from public.profiles p where p.id=v_actor and p.role::text='admin' and p.verification_status::text='verified') then
    raise exception 'A verified campus administrator is required.';
  end if;
  if v_university_id is null then raise exception 'A university membership is required.'; end if;
  return query
    select c.id,c.subject_user_id,c.evidence_type,c.outcome,c.source_kind,c.source_reference,c.reviewer_note,c.checked_by,c.checked_at
    from public.campus_identity_evidence_checks c
    where c.university_id=v_university_id
      and (p_subject_user_id is null or c.subject_user_id=p_subject_user_id)
    order by c.checked_at desc
    limit 200;
end;
$function$

CREATE OR REPLACE FUNCTION public.list_campus_identity_evidence_checks(p_subject_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, subject_user_id uuid, evidence_type text, outcome text, source_kind text, source_reference text, reviewer_note text, checked_by uuid, checked_at timestamp with time zone)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.list_campus_identity_evidence_checks_impl(p_subject_user_id);
$wrapper$;
REVOKE ALL ON FUNCTION private.list_campus_identity_evidence_checks_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_identity_evidence_checks_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_campus_identity_evidence_checks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_identity_evidence_checks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.list_campus_staff_membership_reviews_impl()
 RETURNS TABLE(user_id uuid, username text, requested_role text, account_role text, account_status text, campus_status text, faculty text, department text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin'
     or (select private.current_campus_university_id()) is null
     or not exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified administrator for this university is required.';
  end if;

  return query
    select p.id, cp.username, p.requested_role::text, p.role::text,
      p.verification_status::text, cm.verification_status::text, cm.faculty, cm.department, cm.created_at
    from public.campus_memberships cm
    join public.profiles p on p.id = cm.user_id
    left join public.community_profiles cp on cp.user_id = p.id
    where cm.university_id = (select private.current_campus_university_id())
      and cm.membership_status = 'active'
      and cm.verification_status in ('unverified','pending')
      and (p.requested_role = 'teacher' or p.role in ('teacher','security','admin'))
    order by cm.created_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.list_campus_staff_membership_reviews()
 RETURNS TABLE(user_id uuid, username text, requested_role text, account_role text, account_status text, campus_status text, faculty text, department text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.list_campus_staff_membership_reviews_impl();
$wrapper$;
REVOKE ALL ON FUNCTION private.list_campus_staff_membership_reviews_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_staff_membership_reviews_impl() TO authenticated;
REVOKE ALL ON FUNCTION public.list_campus_staff_membership_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_staff_membership_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION private.list_campus_staff_verification_reviews_impl()
 RETURNS TABLE(user_id uuid, username text, position_title text, staff_number text, official_email text, document_path text, requested_campus_admin boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin'
     or (select private.current_campus_university_id()) is null
     or not exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified administrator for this university is required.';
  end if;
  return query
    select v.user_id, cp.username, v.position_title, v.staff_number,
           v.official_email, v.document_path, v.requested_campus_admin, v.created_at
    from public.campus_staff_verifications v
    left join public.community_profiles cp on cp.user_id=v.user_id
    where v.university_id=(select private.current_campus_university_id())
      and v.status='pending'
    order by v.created_at asc;
end;
$function$

CREATE OR REPLACE FUNCTION public.list_campus_staff_verification_reviews()
 RETURNS TABLE(user_id uuid, username text, position_title text, staff_number text, official_email text, document_path text, requested_campus_admin boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.list_campus_staff_verification_reviews_impl();
$wrapper$;
REVOKE ALL ON FUNCTION private.list_campus_staff_verification_reviews_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_staff_verification_reviews_impl() TO authenticated;
REVOKE ALL ON FUNCTION public.list_campus_staff_verification_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_staff_verification_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION private.list_my_campus_marketplace_listings_impl()
 RETURNS TABLE(listing_id uuid, listing_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id,l.status
  from public.campus_marketplace_listings l
  where l.seller_id=(select auth.uid())
    and l.university_id=(select private.current_campus_university_id())
    and l.status in ('pending','published','sold','hidden','rejected')
  order by l.created_at desc;
$function$

CREATE OR REPLACE FUNCTION public.list_my_campus_marketplace_listings()
 RETURNS TABLE(listing_id uuid, listing_status text)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.list_my_campus_marketplace_listings_impl();
$wrapper$;
REVOKE ALL ON FUNCTION private.list_my_campus_marketplace_listings_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_my_campus_marketplace_listings_impl() TO authenticated;
REVOKE ALL ON FUNCTION public.list_my_campus_marketplace_listings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_campus_marketplace_listings() TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_assign_campus_admin_impl(p_user_id uuid, p_university_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  if not exists (
    select 1
    from public.campus_staff_verifications v
    join public.profiles p on p.id=v.user_id
    join public.campus_memberships cm on cm.user_id=v.user_id and cm.university_id=v.university_id
    join public.campus_universities u on u.id=v.university_id
    where v.user_id=p_user_id
      and v.university_id=p_university_id
      and v.status='approved'
      and v.requested_campus_admin=true
      and p.verification_status='verified'
      and p.role::text='teacher'
      and cm.campus_role='teacher'
      and cm.membership_status='active'
      and cm.verification_status='verified'
      and u.is_active
  ) then
    raise exception 'Only verified staff approved for their university and explicitly requesting campus administrator consideration can be appointed.';
  end if;
  update public.profiles
    set role='admin'
    where id=p_user_id
      and verification_status='verified'
      and role::text='teacher';
  if not found then raise exception 'Campus administrator could not be assigned.'; end if;
  update public.campus_memberships
    set campus_role='admin', updated_at=now()
    where user_id=p_user_id
      and university_id=p_university_id
      and campus_role='teacher'
      and membership_status='active'
      and verification_status='verified';
  if not found then raise exception 'Campus administrator membership is not verified for this university.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.platform_assign_campus_admin(p_user_id uuid, p_university_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.platform_assign_campus_admin_impl(p_user_id, p_university_id);
$wrapper$;
REVOKE ALL ON FUNCTION private.platform_assign_campus_admin_impl(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.platform_assign_campus_admin_impl(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_assign_campus_admin(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_assign_campus_admin(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_list_campus_admin_requests_impl()
 RETURNS TABLE(user_id uuid, username text, university_id uuid, university_name text, position_title text, official_email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  return query
    select v.user_id, cp.username, v.university_id, u.name, v.position_title,
           v.official_email, v.created_at
    from public.campus_staff_verifications v
    join public.profiles p on p.id=v.user_id
    join public.campus_memberships cm on cm.user_id=v.user_id and cm.university_id=v.university_id
    join public.campus_universities u on u.id=v.university_id
    left join public.community_profiles cp on cp.user_id=v.user_id
    where v.status='approved'
      and v.requested_campus_admin
      and p.role::text='teacher'
      and p.verification_status='verified'
      and cm.campus_role='teacher'
      and cm.membership_status='active'
      and cm.verification_status='verified'
    order by v.created_at asc;
end;
$function$

CREATE OR REPLACE FUNCTION public.platform_list_campus_admin_requests()
 RETURNS TABLE(user_id uuid, username text, university_id uuid, university_name text, position_title text, official_email text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.platform_list_campus_admin_requests_impl();
$wrapper$;
REVOKE ALL ON FUNCTION private.platform_list_campus_admin_requests_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.platform_list_campus_admin_requests_impl() TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_campus_admin_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_campus_admin_requests() TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_list_campus_staff_candidates_impl(p_university_id uuid)
 RETURNS TABLE(user_id uuid, username text, account_role text, account_status text, campus_status text, faculty text, department text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  ) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  if not exists (
    select 1 from public.campus_universities u
    where u.id=p_university_id and u.is_active
  ) then
    raise exception 'Choose an active university from the directory.';
  end if;

  return query
    select p.id, cp.username, p.role::text, p.verification_status::text,
           cm.verification_status::text, cm.faculty, cm.department
    from public.campus_memberships cm
    join public.profiles p on p.id=cm.user_id
    left join public.community_profiles cp on cp.user_id=p.id
    where cm.university_id=p_university_id
      and cm.membership_status='active'
      and cm.verification_status='verified'
      and p.verification_status='verified'
      and p.role::text in ('teacher','security','admin')
    order by cp.username;
end;
$function$

CREATE OR REPLACE FUNCTION public.platform_list_campus_staff_candidates(p_university_id uuid)
 RETURNS TABLE(user_id uuid, username text, account_role text, account_status text, campus_status text, faculty text, department text)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.platform_list_campus_staff_candidates_impl(p_university_id);
$wrapper$;
REVOKE ALL ON FUNCTION private.platform_list_campus_staff_candidates_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.platform_list_campus_staff_candidates_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_campus_staff_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_campus_staff_candidates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_list_campus_university_requests_impl()
 RETURNS TABLE(id uuid, university_name text, state text, ownership text, official_website text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from private.platform_admins pa where pa.user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  return query
    select r.id,r.university_name,r.state,r.ownership,r.official_website,r.status,r.created_at
    from public.campus_university_requests r
    where r.status='pending'
    order by r.created_at asc;
end;
$function$

CREATE OR REPLACE FUNCTION public.platform_list_campus_university_requests()
 RETURNS TABLE(id uuid, university_name text, state text, ownership text, official_website text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.platform_list_campus_university_requests_impl();
$wrapper$;
REVOKE ALL ON FUNCTION private.platform_list_campus_university_requests_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.platform_list_campus_university_requests_impl() TO authenticated;
REVOKE ALL ON FUNCTION public.platform_list_campus_university_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_campus_university_requests() TO authenticated;

CREATE OR REPLACE FUNCTION private.platform_review_campus_university_request_impl(p_request_id uuid, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.campus_university_requests%rowtype;
  v_existing_id uuid;
  v_slug text;
  v_suffix text;
begin
  if not exists(select 1 from private.platform_admins pa where pa.user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select r.* into v_request
  from public.campus_university_requests r
  where r.id=p_request_id and r.status='pending'
  for update;
  if not found then raise exception 'Pending university request not found.'; end if;

  if p_decision='approve' then
    select u.id into v_existing_id
    from public.campus_universities u
    where lower(btrim(u.name))=lower(btrim(v_request.university_name))
    limit 1;

    if v_existing_id is null then
      v_slug := trim(both '-' from regexp_replace(lower(btrim(v_request.university_name)), '[^a-z0-9]+', '-', 'g'));
      if v_slug='' then v_slug := 'university'; end if;
      if exists(select 1 from public.campus_universities u where u.slug=v_slug) then
        v_suffix := substr(md5(lower(btrim(v_request.university_name))),1,8);
        v_slug := left(v_slug,150) || '-' || v_suffix;
      end if;

      insert into public.campus_universities
        (name,slug,ownership,state,source_url,official_website,is_active)
      values
        (btrim(v_request.university_name),v_slug,v_request.ownership,btrim(v_request.state),
         'https://enuc.nuc.edu.ng/nus',case when btrim(coalesce(v_request.official_website,'')) ~* '^https?://[^[:space:]]+,true);
    end if;

    update public.campus_university_requests
      set status='approved',reviewed_at=now()
      where id=p_request_id and status='pending';
  else
    update public.campus_university_requests
      set status='rejected',reviewed_at=now()
      where id=p_request_id and status='pending';
  end if;

  if not found then raise exception 'University request could not be reviewed.'; end if;
end;
$function$
 then nullif(btrim(v_request.official_website),'') else null end,true);
    end if;

    update public.campus_university_requests
      set status='approved',reviewed_at=now()
      where id=p_request_id and status='pending';
  else
    update public.campus_university_requests
      set status='rejected',reviewed_at=now()
      where id=p_request_id and status='pending';
  end if;

  if not found then raise exception 'University request could not be reviewed.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.platform_review_campus_university_request(p_request_id uuid, p_decision text)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.platform_review_campus_university_request_impl(p_request_id, p_decision);
$wrapper$;
REVOKE ALL ON FUNCTION private.platform_review_campus_university_request_impl(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.platform_review_campus_university_request_impl(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_review_campus_university_request(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_review_campus_university_request(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.request_campus_university_impl(p_university_name text, p_state text, p_ownership text, p_official_website text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to request a university listing.'; end if;
  if char_length(btrim(coalesce(p_university_name,''))) not between 3 and 180 then raise exception 'Enter a valid university name.'; end if;
  if char_length(btrim(coalesce(p_state,''))) not between 2 and 80 then raise exception 'Enter a state or FCT.'; end if;
  if p_ownership not in ('Federal','State','Private') then raise exception 'Select Federal, State, or Private.'; end if;
  if p_official_website is not null and (
    char_length(btrim(p_official_website)) > 250
    or btrim(p_official_website) !~* '^https?://[^[:space:]]+
  if exists (select 1 from public.campus_universities u where lower(u.name) = lower(btrim(p_university_name))) then
    raise exception 'That university is already in the directory.';
  end if;
  insert into public.campus_university_requests (requester_id, university_name, state, ownership, official_website)
  values (v_user_id, btrim(p_university_name), btrim(p_state), p_ownership, nullif(btrim(coalesce(p_official_website,'')), ''))
  returning id into v_id;
  return v_id;
end;
$function$

  ) then raise exception 'Enter a valid HTTP or HTTPS official website URL (maximum 250 characters).'; end if;
  if exists (select 1 from public.campus_universities u where lower(u.name) = lower(btrim(p_university_name))) then
    raise exception 'That university is already in the directory.';
  end if;
  insert into public.campus_university_requests (requester_id, university_name, state, ownership, official_website)
  values (v_user_id, btrim(p_university_name), btrim(p_state), p_ownership, nullif(btrim(coalesce(p_official_website,'')), ''))
  returning id into v_id;
  return v_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.request_campus_university(p_university_name text, p_state text, p_ownership text, p_official_website text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.request_campus_university_impl(p_university_name, p_state, p_ownership, p_official_website);
$wrapper$;
REVOKE ALL ON FUNCTION private.request_campus_university_impl(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.request_campus_university_impl(text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.request_campus_university(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_campus_university(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.review_campus_staff_membership_impl(p_user_id uuid, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_requested_role text;
  v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin'
     or (select private.current_campus_university_id()) is null
     or not exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select p.role::text, p.requested_role::text
    into v_role, v_requested_role
  from public.profiles p
  join public.campus_memberships cm on cm.user_id=p.id
  where p.id=p_user_id
    and cm.university_id=v_university_id
    and cm.membership_status='active'
    and cm.verification_status in ('unverified','pending')
    and (p.requested_role='teacher' or p.role::text in ('teacher','security','admin'));
  if not found then
    raise exception 'This staff membership request is not in your university queue.';
  end if;

  if (v_requested_role='teacher' or v_role='teacher') and not exists (
    select 1
    from public.campus_staff_verifications v
    where v.user_id=p_user_id
      and v.university_id=v_university_id
      and v.status='approved'
  ) then
    raise exception 'Teacher identity must be approved through the staff verification queue first.';
  end if;

  update public.campus_memberships
    set verification_status=case p_decision when 'approve' then 'verified' else 'rejected' end,
        campus_role=case when p_decision='approve' then v_role else campus_role end,
        updated_at=now()
  where user_id=p_user_id
    and university_id=v_university_id
    and membership_status='active';
  if not found then
    raise exception 'Campus membership could not be updated.';
  end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.review_campus_staff_membership(p_user_id uuid, p_decision text)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.review_campus_staff_membership_impl(p_user_id, p_decision);
$wrapper$;
REVOKE ALL ON FUNCTION private.review_campus_staff_membership_impl(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.review_campus_staff_membership_impl(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_campus_staff_membership(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_campus_staff_membership(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.review_campus_staff_verification_impl(p_user_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_requested_role text;
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin'
     or (select private.current_campus_university_id()) is null
     or not exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'Give a short reason so the staff member can correct the application.';
  end if;

  select p.requested_role::text into v_requested_role
  from public.campus_staff_verifications v
  join public.profiles p on p.id=v.user_id
  join public.campus_memberships cm on cm.user_id=v.user_id
  where v.user_id=p_user_id and v.university_id=v_university_id and v.status='pending'
    and cm.university_id=v_university_id and cm.membership_status='active';
  if not found then raise exception 'Pending staff verification not found for your university.'; end if;

  update public.campus_staff_verifications
    set status=case when p_decision='approve' then 'approved' else 'rejected' end,
        rejection_reason=case when p_decision='reject' then btrim(p_rejection_reason) else null end,
        reviewed_by=(select auth.uid()), reviewed_at=now(), updated_at=now()
    where user_id=p_user_id and university_id=v_university_id and status='pending';

  if p_decision='approve' then
    update public.profiles set role='teacher', verification_status='verified'
    where id=p_user_id and requested_role='teacher';
    if not found then raise exception 'Staff account role could not be verified.'; end if;
    update public.campus_memberships
      set campus_role='teacher', verification_status='verified', updated_at=now()
      where user_id=p_user_id and university_id=v_university_id and membership_status='active';
    if not found then raise exception 'Staff campus membership could not be verified.'; end if;
  else
    update public.profiles set verification_status='pending'
    where id=p_user_id and requested_role='teacher';
    update public.campus_memberships
      set verification_status='rejected', updated_at=now()
      where user_id=p_user_id and university_id=v_university_id and membership_status='active';
  end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.review_campus_staff_verification(p_user_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.review_campus_staff_verification_impl(p_user_id, p_decision, p_rejection_reason);
$wrapper$;
REVOKE ALL ON FUNCTION private.review_campus_staff_verification_impl(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.review_campus_staff_verification_impl(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_campus_staff_verification(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_campus_staff_verification(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.submit_campus_staff_verification_impl(p_position_title text, p_staff_number text DEFAULT NULL::text, p_official_email text DEFAULT NULL::text, p_document_path text DEFAULT NULL::text, p_requested_campus_admin boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_document_ok boolean := false;
  v_requested_role text;
  v_current_role text;
  v_profile_status text;
begin
  if v_user_id is null then raise exception 'Sign in before submitting staff verification.'; end if;
  if v_university_id is null then raise exception 'Choose your university during account creation before submitting staff verification.'; end if;
  if char_length(btrim(coalesce(p_position_title,''))) not between 2 and 120 then
    raise exception 'Enter your official position in the university.';
  end if;
  if nullif(btrim(coalesce(p_staff_number,'')), '') is null
     and nullif(btrim(coalesce(p_official_email,'')), '') is null
     and nullif(btrim(coalesce(p_document_path,'')), '') is null then
    raise exception 'Provide a staff number, official university email, or staff ID document.';
  end if;
  if nullif(btrim(coalesce(p_official_email,'')), '') is not null
     and (char_length(btrim(p_official_email)) > 254 or position('@' in p_official_email) < 2) then
    raise exception 'Enter a valid official university email address.';
  end if;
  if p_document_path is not null then
    if p_document_path not like v_user_id::text || '/%' then
      raise exception 'The staff document must be uploaded to your own private folder.';
    end if;
    select exists (
      select 1 from storage.objects o
      where o.bucket_id = 'campus-staff-documents'
        and o.name = p_document_path
        and o.owner_id = v_user_id::text
        and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png')
        and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 5242880
    ) into v_document_ok;
    if not v_document_ok then raise exception 'The private staff ID document was not found or is not an allowed file.'; end if;
  end if;

  select p.requested_role::text, p.role::text, p.verification_status::text
    into v_requested_role, v_current_role, v_profile_status
  from public.profiles p where p.id = v_user_id;
  if v_requested_role is distinct from 'teacher'
     or v_current_role in ('teacher','security','admin')
     or v_profile_status is distinct from 'pending' then
    raise exception 'Staff verification is available only to pending accounts registered for a teacher or staff role.';
  end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=v_user_id and cm.university_id=v_university_id
      and cm.membership_status='active'
  ) then raise exception 'Your campus membership is missing or does not match your selected university.'; end if;

  insert into public.campus_staff_verifications
    (user_id, university_id, position_title, staff_number, official_email, document_path,
     requested_campus_admin, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at)
  values
    (v_user_id, v_university_id, btrim(p_position_title),
     nullif(btrim(coalesce(p_staff_number,'')), ''),
     nullif(lower(btrim(coalesce(p_official_email,''))), ''),
     nullif(btrim(coalesce(p_document_path,'')), ''),
     coalesce(p_requested_campus_admin,false), 'pending', null, null, null, now(), now())
  on conflict (user_id) do update
    set position_title=excluded.position_title,
        staff_number=excluded.staff_number,
        official_email=excluded.official_email,
        document_path=excluded.document_path,
        requested_campus_admin=excluded.requested_campus_admin,
        status='pending', rejection_reason=null, reviewed_by=null, reviewed_at=null, updated_at=now()
    where public.campus_staff_verifications.status='rejected';
  if not found then raise exception 'A staff verification is already pending or approved.'; end if;

  update public.campus_memberships
    set verification_status='pending', updated_at=now()
  where user_id=v_user_id and university_id=v_university_id and membership_status='active';
end;
$function$

CREATE OR REPLACE FUNCTION public.submit_campus_staff_verification(p_position_title text, p_staff_number text DEFAULT NULL::text, p_official_email text DEFAULT NULL::text, p_document_path text DEFAULT NULL::text, p_requested_campus_admin boolean DEFAULT false)
 RETURNS void
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $wrapper$
  SELECT private.submit_campus_staff_verification_impl(p_position_title, p_staff_number, p_official_email, p_document_path, p_requested_campus_admin);
$wrapper$;
REVOKE ALL ON FUNCTION private.submit_campus_staff_verification_impl(text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.submit_campus_staff_verification_impl(text,text,text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_campus_staff_verification(text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_staff_verification(text,text,text,text,boolean) TO authenticated;

COMMIT;
