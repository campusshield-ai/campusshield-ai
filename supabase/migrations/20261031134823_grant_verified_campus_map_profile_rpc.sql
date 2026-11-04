-- Same permission grant as applied in Staging.
-- The target function validates the signed-in verified campus administrator internally.
GRANT EXECUTE ON FUNCTION private.manage_campus_map_campus_impl(uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text) TO authenticated;
