-- Allow the authenticated scanner to check Story attachment eligibility before scanning a file.
-- The wrapper reveals only a boolean and delegates all authorization to the existing private predicate.
begin;

create or replace function public.can_upload_campus_story_media(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select auth.uid()) is not null, false)
    and coalesce((
      select private.can_upload_campus_story_media(
        coalesce((select private.current_campus_university_id())::text, '') || '/' ||
        coalesce(p_story_id::text, '') || '/scan-preflight'
      )
    ), false);
$function$;

revoke all on function public.can_upload_campus_story_media(uuid) from public, anon;
grant execute on function public.can_upload_campus_story_media(uuid) to authenticated;

commit;
