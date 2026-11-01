-- Harden privileges on the additive CampusPulse social tables.
-- Applied to CampusShield AI Staging only as version 20261101190831.
-- Keep RLS-protected row operations; remove unsafe default table-level privileges.
revoke all on table
  public.campus_collab_listings,
  public.campus_event_buddy_listings,
  public.campus_mentorship_profiles,
  public.campus_memories,
  public.campus_peer_connection_requests,
  public.campus_social_feature_reports
from anon, authenticated;

grant select, insert, update, delete on table
  public.campus_collab_listings,
  public.campus_event_buddy_listings,
  public.campus_mentorship_profiles,
  public.campus_memories
to authenticated;

grant select, insert, update on table
  public.campus_peer_connection_requests,
  public.campus_social_feature_reports
to authenticated;

-- service_role retains its existing server-side privileges.
