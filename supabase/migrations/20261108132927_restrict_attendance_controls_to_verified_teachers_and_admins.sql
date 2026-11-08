CREATE OR REPLACE FUNCTION private.can_manage_class_attendance(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    private.is_verified_classroom_teacher(p_classroom_id)
    OR private.is_verified_campus_admin_for_classroom(p_classroom_id);
$function$;
