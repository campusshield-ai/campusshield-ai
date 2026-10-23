-- Safe helpers for the university-only group, event and marketplace screens.
begin;

create or replace function public.list_my_campus_marketplace_listings()
returns table(listing_id uuid, listing_status text)
language sql stable security definer set search_path to ''
as $function$
  select l.id,l.status
  from public.campus_marketplace_listings l
  where l.seller_id=(select auth.uid())
    and l.university_id=(select private.current_campus_university_id())
    and l.status in ('pending','published','sold','hidden','rejected')
  order by l.created_at desc;
$function$;

revoke all on function public.list_my_campus_marketplace_listings() from public,anon;
grant execute on function public.list_my_campus_marketplace_listings() to authenticated;

commit;
