-- Student identity automation is fail-closed and never treats malware-clean as identity proof.
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS automated_review_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS automated_review_reason_code text,
  ADD COLUMN IF NOT EXISTS automated_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS automated_review_provider text,
  ADD COLUMN IF NOT EXISTS automated_review_reference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_identity_automated_review_status_check'
      AND conrelid = 'public.student_identity_verifications'::regclass
  ) THEN
    ALTER TABLE public.student_identity_verifications
      ADD CONSTRAINT student_identity_automated_review_status_check
      CHECK (automated_review_status IN ('not_started','manual_review_required','auto_approved'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.campus_identity_auto_review_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('manual_review_required','auto_approved')),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 80),
  provider_name text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campus_identity_auto_review_audit_subject_idx
  ON public.campus_identity_auto_review_audit(subject_user_id, created_at DESC);
ALTER TABLE public.campus_identity_auto_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_identity_auto_review_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campus_identity_auto_review_audit TO service_role;

CREATE OR REPLACE FUNCTION private.reset_student_identity_automation_on_resubmission()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF NEW.object_path IS DISTINCT FROM OLD.object_path
     OR (OLD.status = 'rejected' AND NEW.status = 'pending') THEN
    NEW.automated_review_status := 'not_started';
    NEW.automated_review_reason_code := NULL;
    NEW.automated_reviewed_at := NULL;
    NEW.automated_review_provider := NULL;
    NEW.automated_review_reference := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reset_student_identity_automation_on_resubmission
  ON public.student_identity_verifications;
CREATE TRIGGER reset_student_identity_automation_on_resubmission
BEFORE UPDATE ON public.student_identity_verifications
FOR EACH ROW EXECUTE FUNCTION private.reset_student_identity_automation_on_resubmission();
REVOKE ALL ON FUNCTION private.reset_student_identity_automation_on_resubmission() FROM PUBLIC, anon, authenticated;

-- This routine can only be called by the service-role Edge Function after an
-- exact positive result from the institution's authorised verification endpoint.
CREATE OR REPLACE FUNCTION public.auto_approve_student_identity_from_official_verifier(
  p_user_id uuid,
  p_university_id uuid,
  p_student_number text,
  p_file_sha256 text,
  p_provider_name text,
  p_provider_reference text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_profile_role text;
  v_requested_role text;
  v_profile_status text;
  v_identity_status text;
  v_identity_university uuid;
  v_identity_number text;
  v_object_path text;
  v_confirmed_fraud boolean;
  v_email_confirmed_at timestamptz;
  v_normalized_number text;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted identity-verification service may auto-approve a student.';
  END IF;
  IF p_user_id IS NULL OR p_university_id IS NULL
     OR length(btrim(coalesce(p_student_number,''))) NOT BETWEEN 2 AND 80
     OR coalesce(p_file_sha256,'') !~ '^[0-9a-fA-F]{64}$'
     OR length(btrim(coalesce(p_provider_name,''))) NOT BETWEEN 2 AND 80
     OR length(btrim(coalesce(p_provider_reference,''))) NOT BETWEEN 2 AND 180 THEN
    RAISE EXCEPTION 'The official verification evidence is incomplete.';
  END IF;

  v_normalized_number := lower(regexp_replace(btrim(p_student_number), '\s+', '', 'g'));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_university_id::text || ':' || v_normalized_number, 0)
  );

  SELECT p.role::text, p.requested_role::text, p.verification_status::text
    INTO v_profile_role, v_requested_role, v_profile_status
  FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile_role IS DISTINCT FROM 'student'
     OR v_requested_role IS DISTINCT FROM 'student'
     OR v_profile_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only a pending student application can be automatically approved.';
  END IF;

  SELECT siv.status, siv.university_id, siv.student_number, siv.object_path, siv.confirmed_fraud
    INTO v_identity_status, v_identity_university, v_identity_number, v_object_path, v_confirmed_fraud
  FROM public.student_identity_verifications siv WHERE siv.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_identity_status IS DISTINCT FROM 'pending'
     OR v_identity_university IS DISTINCT FROM p_university_id
     OR lower(btrim(v_identity_number)) IS DISTINCT FROM lower(btrim(p_student_number))
     OR coalesce(v_confirmed_fraud, false) THEN
    RAISE EXCEPTION 'The pending student identity record does not match the official verification.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_identity_upload_scans s
    WHERE s.user_id = p_user_id AND s.file_sha256 = lower(p_file_sha256) AND s.status = 'clean'
  ) THEN RAISE EXCEPTION 'The submitted document has not passed the secure file scan.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'student-identity-documents'
      AND o.name = v_object_path
      AND left(o.name, 37) = p_user_id::text || '/'
  ) THEN RAISE EXCEPTION 'The private identity document could not be confirmed.'; END IF;

  SELECT u.email_confirmed_at INTO v_email_confirmed_at
  FROM auth.users u WHERE u.id = p_user_id;
  IF v_email_confirmed_at IS NULL THEN
    UPDATE public.student_identity_verifications
    SET automated_review_status = 'manual_review_required',
        automated_review_reason_code = 'email_not_confirmed',
        automated_reviewed_at = now(), automated_review_provider = btrim(p_provider_name),
        automated_review_reference = btrim(p_provider_reference), updated_at = now()
    WHERE user_id = p_user_id;
    INSERT INTO public.campus_identity_auto_review_audit
      (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
    VALUES (p_user_id, p_university_id, lower(p_file_sha256), 'manual_review_required',
      'email_not_confirmed', btrim(p_provider_name), btrim(p_provider_reference));
    RETURN jsonb_build_object('approved', false, 'reason_code', 'email_not_confirmed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_identity_verifications other
    WHERE other.user_id <> p_user_id AND other.university_id = p_university_id
      AND other.status IN ('pending','approved')
      AND lower(regexp_replace(btrim(other.student_number), '\s+', '', 'g')) = v_normalized_number
  ) OR EXISTS (
    SELECT 1 FROM public.student_identity_upload_scans other
    WHERE other.user_id <> p_user_id AND other.file_sha256 = lower(p_file_sha256)
      AND other.status = 'clean'
  ) THEN
    UPDATE public.student_identity_verifications
    SET automated_review_status = 'manual_review_required',
        automated_review_reason_code = 'duplicate_identity_signal',
        automated_reviewed_at = now(), automated_review_provider = btrim(p_provider_name),
        automated_review_reference = btrim(p_provider_reference), updated_at = now()
    WHERE user_id = p_user_id;
    INSERT INTO public.campus_identity_auto_review_audit
      (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
    VALUES (p_user_id, p_university_id, lower(p_file_sha256), 'manual_review_required',
      'duplicate_identity_signal', btrim(p_provider_name), btrim(p_provider_reference));
    RETURN jsonb_build_object('approved', false, 'reason_code', 'duplicate_identity_signal');
  END IF;

  UPDATE public.student_identity_verifications
  SET status = 'approved', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = now(),
      confirmed_fraud = false, fraud_decision_reason = NULL, fraud_decided_by = NULL,
      fraud_decided_at = NULL, fraud_notice_at = NULL, fraud_lock_at = NULL,
      automated_review_status = 'auto_approved',
      automated_review_reason_code = 'official_source_confirmed',
      automated_reviewed_at = now(), automated_review_provider = btrim(p_provider_name),
      automated_review_reference = btrim(p_provider_reference), updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'The student identity record changed during automatic review.'; END IF;

  UPDATE public.profiles
  SET role = 'student', verification_status = 'verified'
  WHERE id = p_user_id AND verification_status::text = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'The student account changed during automatic review.'; END IF;

  UPDATE public.campus_memberships
  SET campus_role = 'student', verification_status = 'verified', updated_at = now()
  WHERE user_id = p_user_id AND university_id = p_university_id AND membership_status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'An active campus membership is required for automatic approval.'; END IF;

  INSERT INTO public.campus_identity_auto_review_audit
    (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
  VALUES (p_user_id, p_university_id, lower(p_file_sha256), 'auto_approved',
    'official_source_confirmed', btrim(p_provider_name), btrim(p_provider_reference));
  RETURN jsonb_build_object('approved', true, 'reason_code', 'official_source_confirmed');
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_approve_student_identity_from_official_verifier(
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_student_identity_from_official_verifier(
  uuid, uuid, text, text, text, text
) TO service_role;
