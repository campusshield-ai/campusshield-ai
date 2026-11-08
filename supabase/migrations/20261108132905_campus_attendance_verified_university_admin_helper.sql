CREATE OR REPLACE FUNCTION private.is_verified_campus_admin_for_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.campus_classrooms c
    JOIN public.profiles p ON p.id = (SELECT auth.uid())
    JOIN public.campus_memberships m
      ON m.user_id = p.id
     AND m.university_id = c.university_id
    JOIN public.campus_universities u
      ON u.id = c.university_id
    WHERE c.id = p_classroom_id
      AND u.is_active = true
      AND p.role = 'admin'
      AND p.verification_status = 'verified'
      AND m.campus_role = 'admin'
      AND m.membership_status = 'active'
      AND m.verification_status = 'verified'
  );
$function$;