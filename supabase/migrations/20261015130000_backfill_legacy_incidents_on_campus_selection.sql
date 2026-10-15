-- Preserve staff access to older incident records after a reporter chooses their campus.
-- Only unassigned incidents reported by the member are associated with that member's active campus.
-- This is additive; do not run against production until the full release rollout is approved.
begin;

create or replace function private.backfill_legacy_incidents_for_membership()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.membership_status = 'active' then
    update public.incidents i
      set university_id = new.university_id
    where i.reporter_id = new.user_id
      and i.university_id is null;
  end if;

  return new;
end;
$function$;

revoke all on function private.backfill_legacy_incidents_for_membership() from public, anon, authenticated;

drop trigger if exists backfill_legacy_incidents_after_membership on public.campus_memberships;
create trigger backfill_legacy_incidents_after_membership
  after insert or update of university_id, membership_status
  on public.campus_memberships
  for each row
  execute function private.backfill_legacy_incidents_for_membership();

-- Map any already-onboarded members' unassigned legacy reports. Others are mapped when
-- they complete campus onboarding, so old reports are never exposed to every campus by default.
update public.incidents i
set university_id = cm.university_id
from public.campus_memberships cm
where cm.user_id = i.reporter_id
  and cm.membership_status = 'active'
  and i.university_id is null;

commit;
