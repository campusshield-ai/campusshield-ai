-- Platform-admin console RPCs for reviewing university requests and assigning campus staff.
begin;

alter table public.campus_universities
  add column if not exists official_website text;

create or replace function public.platform_is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from private.platform_admins pa
    where pa.user_id=(select auth.uid())
  );
$function$;

create or replace function public.platform_list_campus_university_requests()
returns table(
  id uuid,
  university_name text,
  state text,
  ownership text,
  official_website text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not exists(select 1 from private.platform_admins pa where pa.user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;

  return query
    select r.id,r.university_name,r.state,r.ownership,r.official_website,r.status,r.created_at
    from public.campus_university_requests r
    where r.status='pending'
    order by r.created_at asc;
end;
$function$;

create or replace function public.platform_review_campus_university_request(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request public.campus_university_requests%rowtype;
  v_existing_id uuid;
  v_slug text;
  v_suffix text;
begin
  if not exists(select 1 from private.platform_admins pa where pa.user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select r.* into v_request
  from public.campus_university_requests r
  where r.id=p_request_id and r.status='pending'
  for update;
  if not found then raise exception 'Pending university request not found.'; end if;

  if p_decision='approve' then
    select u.id into v_existing_id
    from public.campus_universities u
    where lower(btrim(u.name))=lower(btrim(v_request.university_name))
    limit 1;

    if v_existing_id is null then
      v_slug := trim(both '-' from regexp_replace(lower(btrim(v_request.university_name)), '[^a-z0-9]+', '-', 'g'));
      if v_slug='' then v_slug := 'university'; end if;
      if exists(select 1 from public.campus_universities u where u.slug=v_slug) then
        v_suffix := substr(md5(lower(btrim(v_request.university_name))),1,8);
        v_slug := left(v_slug,150) || '-' || v_suffix;
      end if;

      insert into public.campus_universities
        (name,slug,ownership,state,source_url,official_website,is_active)
      values
        (btrim(v_request.university_name),v_slug,v_request.ownership,btrim(v_request.state),
         'https://enuc.nuc.edu.ng/nus',nullif(btrim(coalesce(v_request.official_website,'')),''),true);
    end if;

    update public.campus_university_requests
      set status='approved',reviewed_at=now()
      where id=p_request_id and status='pending';
  else
    update public.campus_university_requests
      set status='rejected',reviewed_at=now()
      where id=p_request_id and status='pending';
  end if;

  if not found then raise exception 'University request could not be reviewed.'; end if;
end;
$function$;

revoke all on function public.platform_is_admin() from public, anon;
revoke all on function public.platform_list_campus_university_requests() from public, anon;
revoke all on function public.platform_review_campus_university_request(uuid,text) from public, anon;
grant execute on function public.platform_is_admin() to authenticated;
grant execute on function public.platform_list_campus_university_requests() to authenticated;
grant execute on function public.platform_review_campus_university_request(uuid,text) to authenticated;

commit;
