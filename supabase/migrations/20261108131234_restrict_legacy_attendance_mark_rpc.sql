DO $migration$
BEGIN
  IF to_regprocedure('public.mark_campus_class_attendance(uuid,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.mark_campus_class_attendance(uuid, uuid, text) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$migration$;
