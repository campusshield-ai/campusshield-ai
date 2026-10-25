begin;
-- Internal private-schema functions are reachable through guarded SECURITY INVOKER wrappers and RLS policies.
-- The private schema is not intended to be exposed by PostgREST; anonymous schema usage remains denied.
grant usage on schema private to authenticated, service_role;
commit;
