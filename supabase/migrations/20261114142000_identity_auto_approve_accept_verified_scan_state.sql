CREATE OR REPLACE FUNCTION public.auto_approve_student_identity_from_official_verifier(p_user_id uuid, p_university_id uuid, p_student_number text, p_file_sha256 text, p_provider_name text, p_provider_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile_role IS DISTINCT FROM 'student'
     OR v_requested_role IS DISTINCT FROM 'student'
     OR v_profile_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only a pending student application can be automatically approved.';
  END IF;

  SELECT siv.status, siv.university_id, siv.student_number, siv.object_path, siv.confirmed_fraud
    INTO v_identity_status, v_identity_university, v_identity_number, v_object_path, v_confirmed_fraud
  FROM public.student_identity_verifications siv
  WHERE siv.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_identity_status IS DISTINCT FROM 'pending'
     OR v_identity_university IS DISTINCT FROM p_university_id
     OR lower(btrim(v_identity_number)) IS DISTINCT FROM lower(btrim(p_student_number))
     OR coalesce(v_confirmed_fraud, false) THEN
    RAISE EXCEPTION 'The pending student identity record does not match the official verification.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_identity_upload_scans s
    WHERE s.user_id = p_user_id
      AND s.file_sha256 = lower(p_file_sha256)
      AND s.status IN ('scanning','clean')
  ) THEN
    RAISE EXCEPTION 'The submitted document has not passed the secure file scan.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'student-identity-documents'
      AND o.name = v_object_path
      AND left(o.name, 37) = p_user_id::text || '/'
  ) THEN
    RAISE EXCEPTION 'The private identity document could not be confirmed.';
  END IF;

  SELECT u.email_confirmed_at INTO v_email_confirmed_at
  FROM auth.users u WHERE u.id = p_user_id;

  IF v_email_confirmed_at IS NULL THEN
    UPDATE public.student_identity_verifications
    SET automated_review_status = 'manual_review_required',
        automated_review_reason_code = 'email_not_confirmed',
        automated_reviewed_at = now(),
        automated_review_provider = btrim(p_provider_name),
        automated_review_reference = btrim(p_provider_reference),
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.campus_identity_auto_review_audit
      (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
    VALUES
      (p_user_id, p_university_id, lower(p_file_sha256), 'manual_review_required',
       'email_not_confirmed', btrim(p_provider_name), btrim(p_provider_reference));

    RETURN jsonb_build_object('approved', false, 'reason_code', 'email_not_confirmed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_identity_verifications other
    WHERE other.user_id <> p_user_id
      AND other.university_id = p_university_id
      AND other.status IN ('pending','approved')
      AND lower(regexp_replace(btrim(other.student_number), '\s+', '', 'g')) = v_normalized_number
  ) THEN
    UPDATE public.student_identity_verifications
    SET automated_review_status = 'manual_review_required',
        automated_review_reason_code = 'duplicate_student_number',
        automated_reviewed_at = now(),
        automated_review_provider = btrim(p_provider_name),
        automated_review_reference = btrim(p_provider_reference),
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.campus_identity_auto_review_audit
      (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
    VALUES
      (p_user_id, p_university_id, lower(p_file_sha256), 'manual_review_required',
       'duplicate_student_number', btrim(p_provider_name), btrim(p_provider_reference));

    RETURN jsonb_build_object('approved', false, 'reason_code', 'duplicate_student_number');
  END IF;

  UPDATE public.student_identity_verifications
  SET status = 'approved',
      rejection_reason = NULL,
      reviewed_by = NULL,
      reviewed_at = now(),
      confirmed_fraud = false,
      fraud_decision_reason = NULL,
      fraud_decided_by = NULL,
      fraud_decided_at = NULL,
      fraud_notice_at = NULL,
      fraud_lock_at = NULL,
      automated_review_status = 'auto_approved',
      automated_review_reason_code = 'official_source_confirmed',
      automated_reviewed_at = now(),
      automated_review_provider = btrim(p_provider_name),
      automated_review_reference = btrim(p_provider_reference),
      updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The student identity record changed during automatic review.';
  END IF;

  UPDATE public.profiles
  SET role = 'student', verification_status = 'verified'
  WHERE id = p_user_id AND verification_status::text = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The student account changed during automatic review.';
  END IF;

  UPDATE public.campus_memberships
  SET campus_role = 'student', verification_status = 'verified', updated_at = now()
  WHERE user_id = p_user_id
    AND university_id = p_university_id
    AND membership_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active campus membership is required for automatic approval.';
  END IF;

  INSERT INTO public.campus_identity_auto_review_audit
    (subject_user_id, university_id, evidence_sha256, outcome, reason_code, provider_name, provider_reference)
  VALUES
    (p_user_id, p_university_id, lower(p_file_sha256), 'auto_approved',
     'official_source_confirmed', btrim(p_provider_name), btrim(p_provider_reference));

  RETURN jsonb_build_object('approved', true, 'reason_code', 'official_source_confirmed');
END;
$function$
;
REVOKE ALL ON FUNCTION public.auto_approve_student_identity_from_official_verifier(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_student_identity_from_official_verifier(uuid,uuid,text,text,text,text) TO service_role;
