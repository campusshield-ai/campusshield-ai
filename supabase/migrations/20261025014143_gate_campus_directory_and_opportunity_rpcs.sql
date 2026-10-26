begin;

-- RLS must enforce the same campus-verification requirement as the UI.
drop policy if exists campus_courses_read_same_campus on public.campus_courses;
create policy campus_courses_read_same_campus on public.campus_courses
for select to authenticated using (
  (select private.current_user_has_verified_campus_access())
  and university_id = (select private.current_campus_university_id())
  and (
    status = 'published'
    or created_by = (select auth.uid())
    or (status = 'pending' and (select private.current_campus_role()) = any (array['admin','security','teacher']))
  )
);

drop policy if exists campus_course_resources_read_campus_published_or_staff on public.campus_course_resources;
create policy campus_course_resources_read_campus_published_or_staff on public.campus_course_resources
for select to authenticated using (
  (select private.current_user_has_verified_campus_access())
  and university_id = (select private.current_campus_university_id())
  and (
    status = 'published'
    or submitted_by = (select auth.uid())
    or (status = 'pending' and (select private.current_campus_role()) = any (array['admin','security','teacher']))
  )
);

drop policy if exists campus_opportunities_read_same_campus on public.campus_opportunities;
create policy campus_opportunities_read_same_campus on public.campus_opportunities
for select to authenticated using (
  (select private.current_user_has_verified_campus_access())
  and university_id = (select private.current_campus_university_id())
  and (
    (status = 'published' and (deadline is null or deadline > now()))
    or created_by = (select auth.uid())
    or (status = 'pending' and (select private.current_campus_role()) = any (array['admin','security','teacher']))
  )
);

create or replace function public.list_campus_opportunities()
returns table (
  id uuid, university_id uuid, title text, category text, description text,
  eligibility text, provider_name text, source_url text, contact_url text,
  deadline timestamptz, status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  return query select * from private.list_campus_opportunities_impl();
end;
$wrapper$;

create or replace function public.list_my_campus_opportunities()
returns table (
  id uuid, title text, category text, description text, eligibility text,
  provider_name text, source_url text, contact_url text, deadline timestamptz,
  status text, is_official boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  return query select * from private.list_my_campus_opportunities_impl();
end;
$wrapper$;

create or replace function public.create_campus_opportunity(
  p_title text, p_category text, p_description text, p_eligibility text,
  p_provider_name text, p_source_url text, p_contact_url text default null,
  p_deadline timestamptz default null
)
returns uuid language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  return private.create_campus_opportunity_impl(
    p_title,p_category,p_description,p_eligibility,p_provider_name,p_source_url,p_contact_url,p_deadline
  );
end;
$wrapper$;

create or replace function public.update_my_campus_opportunity(
  p_opportunity_id uuid, p_title text, p_category text, p_description text,
  p_eligibility text, p_provider_name text, p_source_url text,
  p_contact_url text default null, p_deadline timestamptz default null
)
returns void language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  perform private.update_my_campus_opportunity_impl(
    p_opportunity_id,p_title,p_category,p_description,p_eligibility,p_provider_name,p_source_url,p_contact_url,p_deadline
  );
  return;
end;
$wrapper$;

create or replace function public.submit_campus_opportunity(p_opportunity_id uuid)
returns void language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  perform private.submit_campus_opportunity_impl(p_opportunity_id);
  return;
end;
$wrapper$;

create or replace function public.review_campus_opportunity(
  p_opportunity_id uuid, p_decision text, p_review_notes text default null
)
returns void language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'A verified campus account and active verified membership are required.' using errcode = '42501';
  end if;
  perform private.review_campus_opportunity_impl(p_opportunity_id,p_decision,p_review_notes);
  return;
end;
$wrapper$;

revoke all on function public.list_campus_opportunities() from public, anon;
revoke all on function public.list_my_campus_opportunities() from public, anon;
revoke all on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) from public, anon;
revoke all on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) from public, anon;
revoke all on function public.submit_campus_opportunity(uuid) from public, anon;
revoke all on function public.review_campus_opportunity(uuid,text,text) from public, anon;

grant execute on function public.list_campus_opportunities() to authenticated;
grant execute on function public.list_my_campus_opportunities() to authenticated;
grant execute on function public.create_campus_opportunity(text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.update_my_campus_opportunity(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.submit_campus_opportunity(uuid) to authenticated;
grant execute on function public.review_campus_opportunity(uuid,text,text) to authenticated;

commit;
