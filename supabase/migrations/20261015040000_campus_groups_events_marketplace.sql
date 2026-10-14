-- Campus-only groups, events and marketplace review workflow.
begin;

-- New groups require moderation before they are visible or joinable.
alter table public.campus_groups drop constraint if exists campus_groups_status_check;
alter table public.campus_groups add constraint campus_groups_status_check
  check (status in ('pending','active','hidden','archived'));
alter table public.campus_groups alter column status set default 'pending';
alter table public.campus_groups add column if not exists creator_username text;

alter table public.campus_events add column if not exists organizer_username text;
alter table public.campus_marketplace_listings add column if not exists seller_username text;

create or replace function private.fill_campus_social_username()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_user_id uuid;
begin
  if tg_table_name='campus_groups' then
    v_user_id := new.created_by;
    select cp.username into new.creator_username from public.community_profiles cp where cp.user_id=v_user_id;
  elsif tg_table_name='campus_events' then
    v_user_id := new.created_by;
    select cp.username into new.organizer_username from public.community_profiles cp where cp.user_id=v_user_id;
  elsif tg_table_name='campus_marketplace_listings' then
    v_user_id := new.seller_id;
    select cp.username into new.seller_username from public.community_profiles cp where cp.user_id=v_user_id;
  end if;
  return new;
end;
$function$;
revoke all on function private.fill_campus_social_username() from public,anon,authenticated;

drop trigger if exists campus_groups_set_username on public.campus_groups;
create trigger campus_groups_set_username before insert on public.campus_groups
for each row execute function private.fill_campus_social_username();
drop trigger if exists campus_events_set_username on public.campus_events;
create trigger campus_events_set_username before insert on public.campus_events
for each row execute function private.fill_campus_social_username();
drop trigger if exists campus_marketplace_set_username on public.campus_marketplace_listings;
create trigger campus_marketplace_set_username before insert on public.campus_marketplace_listings
for each row execute function private.fill_campus_social_username();

drop policy if exists campus_groups_read_same_campus on public.campus_groups;
create policy campus_groups_read_same_campus on public.campus_groups for select to authenticated
using (
  university_id = (select private.current_campus_university_id())
  and (status='active' or created_by=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);
drop policy if exists campus_groups_create_same_campus on public.campus_groups;
create policy campus_groups_create_same_campus on public.campus_groups for insert to authenticated
with check (
  private.current_campus_account_status()=any(array['pending','verified'])
  and created_by=(select auth.uid())
  and university_id=(select private.current_campus_university_id())
  and status='pending'
);

drop policy if exists campus_events_read_same_campus on public.campus_events;
create policy campus_events_read_same_campus on public.campus_events for select to authenticated
using (
  university_id=(select private.current_campus_university_id())
  and (status='published' or created_by=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);

drop policy if exists campus_marketplace_read_same_campus on public.campus_marketplace_listings;
create policy campus_marketplace_read_same_campus on public.campus_marketplace_listings for select to authenticated
using (
  university_id=(select private.current_campus_university_id())
  and (status in ('published','sold') or seller_id=(select auth.uid()) or private.current_campus_role()=any(array['admin','security','teacher']))
);

grant select (id,university_id,name,description,group_type,privacy,status,creator_username,created_at)
  on public.campus_groups to authenticated;
grant select (id,university_id,title,description,category,starts_at,ends_at,location,status,organizer_username,created_at)
  on public.campus_events to authenticated;
grant select (id,university_id,category,title,description,price_ngn,contact_instructions,status,seller_username,created_at,updated_at)
  on public.campus_marketplace_listings to authenticated;

create or replace function public.list_campus_content_moderation()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_university_id uuid := (select private.current_campus_university_id());
  v_role text := coalesce(private.current_campus_role(),'');
  v_result jsonb;
begin
  if v_role not in ('admin','security','teacher') then raise exception 'Verified campus staff access is required.'; end if;
  select jsonb_build_object(
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'group_type',g.group_type,'creator_username',g.creator_username,'created_at',g.created_at))
      from public.campus_groups g where g.university_id=v_university_id and g.status='pending'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'category',e.category,'starts_at',e.starts_at,'ends_at',e.ends_at,'location',e.location,'organizer_username',e.organizer_username,'created_at',e.created_at))
      from public.campus_events e where e.university_id=v_university_id and e.status='pending'),'[]'::jsonb),
    'listings',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'category',l.category,'price_ngn',l.price_ngn,'seller_username',l.seller_username,'created_at',l.created_at))
      from public.campus_marketplace_listings l where l.university_id=v_university_id and l.status='pending'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.review_campus_content(p_content_type text,p_content_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_university_id uuid := (select private.current_campus_university_id());
begin
  if coalesce(private.current_campus_role(),'') not in ('admin','security','teacher') then
    raise exception 'Verified staff membership for this university is required.';
  end if;
  if p_decision not in ('publish','hide','reject') then raise exception 'Decision must be publish, hide, or reject.'; end if;
  if p_content_type='group' then
    update public.campus_groups set status=case p_decision when 'publish' then 'active' when 'hide' then 'hidden' else 'archived' end
      where id=p_content_id and university_id=v_university_id and status='pending';
  elsif p_content_type='event' then
    update public.campus_events set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'cancelled' end
      where id=p_content_id and university_id=v_university_id and status='pending';
  elsif p_content_type='listing' then
    update public.campus_marketplace_listings set status=case p_decision when 'publish' then 'published' when 'hide' then 'hidden' else 'rejected' end, updated_at=now()
      where id=p_content_id and university_id=v_university_id and status='pending';
  else
    raise exception 'Unknown campus content type.';
  end if;
  if not found then raise exception 'This item is not waiting for review in your university.'; end if;
end;
$function$;

revoke all on function public.list_campus_content_moderation() from public,anon;
revoke all on function public.review_campus_content(text,uuid,text) from public,anon;
grant execute on function public.list_campus_content_moderation() to authenticated;
grant execute on function public.review_campus_content(text,uuid,text) to authenticated;

commit;
