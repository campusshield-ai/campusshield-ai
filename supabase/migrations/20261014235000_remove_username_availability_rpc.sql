-- Remove the unused username-enumeration RPC. Duplicate names are enforced by the unique index,
-- and the profile-creation trigger returns a signup error if the requested handle is taken.
drop function if exists public.check_community_username_available(text);
