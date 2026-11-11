-- Pin the profile identity SECURITY DEFINER RPC to an empty search_path.
-- All application table references in the function are already schema-qualified;
-- PostgreSQL built-ins remain resolvable through pg_catalog.

alter function public.update_my_profile_identity(text, text, boolean)
  set search_path = '';
