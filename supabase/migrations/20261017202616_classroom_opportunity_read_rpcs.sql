-- Read RPCs keep the new classroom and Opportunity Hub tables usable without exposing their table endpoints.
begin;

create or replace function public.list_my_campus_classrooms()
returns table (
  id uuid, university_id uuid, name text, subject text, description text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null or (select private.current_campus_university_id()) is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  return query
    select c.id, c.university_id, c.name, c.subject, c.description, c.created_at, c.updated_at
    from public.campus_classrooms c
    where c.university_id = (select private.current_campus_university_id())
      and private.can_access_classroom(c.id)
    order by c.created_at desc
    limit 100;
end;
$function$;

create or replace function public.list_campus_classroom_announcements(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not private.can_access_classroom(p_classroom_id) then
    raise exception 'You are not authorized to access this classroom.' using errcode = '42501';
  end if;
  return query
    select a.id, a.classroom_id, a.title, a.body, a.created_at
    from public.campus_classroom_announcements a
    where a.classroom_id = p_classroom_id
    order by a.created_at desc
    limit 50;
end;
$function$;

create or replace function public.list_campus_classroom_materials(p_classroom_id uuid)
returns table(id uuid, classroom_id uuid, title text, description text, resource_url text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not private.can_access_classroom(p_classroom_id) then
    raise exception 'You are not authorized to access this classroom.' using errcode = '42501';
  end if;
  return query
    select m.id, m.classroom_id, m.title, m.description, m.resource_url, m.created_at
    from public.campus_classroom_materials m
    where m.classroom_id = p_classroom_id
    order by m.created_at desc
    limit 100;
end;
$function$;

create or replace function public.list_campus_opportunities()
returns table (
  id uuid, university_id uuid, title text, category text, description text,
  eligibility text, provider_name text, source_url text, contact_url text,
  deadline timestamptz, status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_campus uuid := (select private.current_campus_university_id());
  v_role text := coalesce((select private.current_campus_role()), '');
begin
  if (select auth.uid()) is null or v_campus is null then
    raise exception 'A verified campus account is required.' using errcode = '42501';
  end if;
  return query
    select o.id, o.university_id, o.title, o.category, o.description,
      o.eligibility, o.provider_name, o.source_url, o.contact_url, o.deadline,
      o.status, o.is_official, o.created_at, o.updated_at
    from public.campus_opportunities o
    where o.university_id = v_campus
      and (
        (o.status = 'published' and (o.deadline is null or o.deadline > now()))
        or (o.status = 'pending' and v_role = any(array['admin','security','teacher']))
      )
    order by o.created_at desc
    limit 100;
end;
$function$;

revoke all on function public.list_my_campus_classrooms() from public, anon, authenticated;
revoke all on function public.list_campus_classroom_announcements(uuid) from public, anon, authenticated;
revoke all on function public.list_campus_classroom_materials(uuid) from public, anon, authenticated;
revoke all on function public.list_campus_opportunities() from public, anon, authenticated;

grant execute on function public.list_my_campus_classrooms() to authenticated;
grant execute on function public.list_campus_classroom_announcements(uuid) to authenticated;
grant execute on function public.list_campus_classroom_materials(uuid) to authenticated;
grant execute on function public.list_campus_opportunities() to authenticated;

commit;
