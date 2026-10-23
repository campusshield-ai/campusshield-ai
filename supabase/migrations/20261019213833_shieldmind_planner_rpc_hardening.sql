-- Keep the personal planner table off direct REST table access; expose only guarded user-scoped RPCs.
revoke all on table public.shieldmind_planner_items from public, anon, authenticated;

create or replace function public.list_my_shieldmind_planner_items()
returns table(id uuid,title text,kind text,details text,starts_at timestamptz,remind_at timestamptz,completed boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = ''
as $function$
  select p.id,p.title,p.kind,p.details,p.starts_at,p.remind_at,p.completed,p.created_at,p.updated_at
  from public.shieldmind_planner_items p
  where auth.uid() is not null and p.user_id = auth.uid()
  order by p.starts_at nulls last,p.created_at desc
  limit 100
$function$;

create or replace function public.create_my_shieldmind_planner_item(
  p_title text,p_kind text,p_details text default '',p_starts_at timestamptz default null,p_remind_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_title,''))) < 2 or char_length(btrim(p_title)) > 120 then raise exception 'Title must be 2–120 characters'; end if;
  if coalesce(p_kind,'revision') not in ('revision','class','assignment','exam','reminder') then raise exception 'Invalid planner item type'; end if;
  if char_length(coalesce(p_details,'')) > 1000 then raise exception 'Notes are too long'; end if;
  insert into public.shieldmind_planner_items(user_id,title,kind,details,starts_at,remind_at)
    values(auth.uid(),btrim(p_title),coalesce(p_kind,'revision'),coalesce(p_details,''),p_starts_at,p_remind_at)
    returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.update_my_shieldmind_planner_item(p_item_id uuid,p_completed boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.shieldmind_planner_items set completed=coalesce(p_completed,false),updated_at=now()
    where id=p_item_id and user_id=auth.uid();
  return found;
end;
$function$;

create or replace function public.delete_my_shieldmind_planner_item(p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.shieldmind_planner_items where id=p_item_id and user_id=auth.uid();
  return found;
end;
$function$;

revoke all on function public.list_my_shieldmind_planner_items() from public, anon, authenticated;
revoke all on function public.create_my_shieldmind_planner_item(text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.update_my_shieldmind_planner_item(uuid,boolean) from public, anon, authenticated;
revoke all on function public.delete_my_shieldmind_planner_item(uuid) from public, anon, authenticated;
grant execute on function public.list_my_shieldmind_planner_items() to authenticated;
grant execute on function public.create_my_shieldmind_planner_item(text,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.update_my_shieldmind_planner_item(uuid,boolean) to authenticated;
grant execute on function public.delete_my_shieldmind_planner_item(uuid) to authenticated;
