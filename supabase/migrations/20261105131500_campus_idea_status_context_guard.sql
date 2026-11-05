-- Derive campus and reviewer identity for staff progress updates.
-- The browser deliberately sends only idea_id, status and note.
create or replace function private.prepare_campus_idea_status_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
     or not private.current_user_has_verified_campus_access()
     or private.current_campus_role() not in ('admin','security','teacher') then
    raise exception 'Verified campus staff membership is required to update idea progress.';
  end if;

  new.reviewer_id := (select auth.uid());
  new.university_id := private.current_campus_university_id();
  new.created_at := now();

  if new.university_id is null
     or not exists (
       select 1 from public.campus_ideas i
        where i.id = new.idea_id
          and i.university_id = new.university_id
     ) then
    raise exception 'The idea is not available in this campus.';
  end if;

  return new;
end;
$function$;

create trigger campus_idea_status_updates_prepare_item
before insert on public.campus_idea_status_updates
for each row execute function private.prepare_campus_idea_status_update();

revoke all on function private.prepare_campus_idea_status_update() from public, anon, authenticated;
