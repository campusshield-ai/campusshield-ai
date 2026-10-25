-- Fix an output-column ambiguity in the course-community creator auto-enrollment path.
create or replace function public.create_campus_course_group(
  p_course_id uuid,
  p_description text default null
)
returns table(group_id uuid, group_status text, group_name text, already_exists boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_course_code text;
  v_course_title text;
  v_course_status text;
  v_group_id uuid;
  v_group_status text;
  v_group_name text;
  v_username text;
  v_description text;
begin
  if v_user_id is null then raise exception 'Sign in to create a course community.'; end if;
  if v_university_id is null
     or (select private.current_campus_account_status()) not in ('pending','verified') then
    raise exception 'Choose your university and complete campus verification first.';
  end if;

  select c.course_code,c.title,c.status
    into v_course_code,v_course_title,v_course_status
  from public.campus_courses c
  where c.id=p_course_id and c.university_id=v_university_id;

  if not found or v_course_status<>'published' then
    raise exception 'This published course is not available in your university.';
  end if;

  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id
  limit 1;

  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;

  select cp.username into v_username
  from public.community_profiles cp where cp.user_id=v_user_id;
  v_description := nullif(btrim(coalesce(p_description,'')), '');
  if v_description is null then
    v_description := 'Course community for '||v_course_code||' · '||v_course_title||'. Share study questions, revision sessions and useful approved resources.';
  end if;
  if char_length(v_description)>1000 then
    raise exception 'Course community description must be 1,000 characters or fewer.';
  end if;

  v_group_name := left(v_course_code||' · '||v_course_title,100);

  insert into public.campus_groups
    (university_id,course_id,created_by,name,description,group_type,privacy,status,creator_username)
  values
    (v_university_id,p_course_id,v_user_id,v_group_name,v_description,'course','campus','pending',v_username)
  returning id,status,name into v_group_id,v_group_status,v_group_name;

  -- "ON CONFLICT" without a column list avoids ambiguity with the RETURNS TABLE output variable.
  insert into public.campus_group_members(group_id,user_id,member_role)
  values (v_group_id,v_user_id,'moderator')
  on conflict do nothing;

  return query select v_group_id,v_group_status,v_group_name,false;
exception when unique_violation then
  select g.id,g.status,g.name into v_group_id,v_group_status,v_group_name
  from public.campus_groups g
  where g.university_id=v_university_id and g.course_id=p_course_id;
  if found then
    return query select v_group_id,v_group_status,v_group_name,true;
    return;
  end if;
  raise;
end;
$function$;

revoke all on function public.create_campus_course_group(uuid,text) from public,anon,authenticated;
grant execute on function public.create_campus_course_group(uuid,text) to authenticated;
