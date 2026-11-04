-- Restrict privileged aggregate coverage access to signed-in users.
-- Applied to Supabase Staging on 2026-11-01 as migration
-- 20261101143036_restrict_public_past_question_coverage_rpc_to_authenticated.

REVOKE EXECUTE ON FUNCTION public.get_past_question_coverage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_past_question_coverage() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_past_question_coverage() IS
  'Returns aggregate approved, rights-confirmed past-question coverage for active universities. Authentication is required; underlying papers remain protected by RLS.';
