-- Complete registration metadata into the existing locked campus membership.
-- Auth user creation may create the membership from university_id before sign-in; do not
-- let that minimal row prevent the rest of the registration details from being saved.
begin;

create or replace function public.set_my_campus_membership(
  p_university_id uuid,
  p_faculty text default null,
  p_department text default null,
  p_course text default null,
  p_year_of_study text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
  v_university_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before choosing your university.'; end if;

  select p.verification_status into v_status
  from public.profiles p where p.id = v_user_id;
  if v_status is null or v_status = 'rejected' then
    raise exception 'This account cannot join a campus community.';
  end if;

  if not exists (select 1 from public.campus_universities u where u.id = p_university_id and u.is_active) then
    raise exception 'Choose a university from the directory.';
  end if;

  if p_faculty is not null and char_length(btrim(p_faculty)) > 120 then raise exception 'Faculty must be 120 characters or fewer.'; end if;
  if p_department is not null and char_length(btrim(p_department)) > 120 then raise exception 'Department must be 120 characters or fewer.'; end if;
  if p_course is not null and char_length(btrim(p_course)) > 120 then raise exception 'Course must be 120 characters or fewer.'; end if;
  if p_year_of_study is not null and char_length(btrim(p_year_of_study)) > 30 then raise exception 'Year of study must be 30 characters or fewer.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm where cm.user_id = v_user_id;
  if found then
    if v_university_id <> p_university_id then
      raise exception 'Your university is locked to protect campus privacy. Contact support to request a transfer.';
    end if;
    update public.campus_memberships
      set faculty=coalesce(nullif(btrim(coalesce(p_faculty,'')),''), faculty),
          department=coalesce(nullif(btrim(coalesce(p_department,'')),''), department),
          course=coalesce(nullif(btrim(coalesce(p_course,'')),''), course),
          year_of_study=coalesce(nullif(btrim(coalesce(p_year_of_study,'')),''), year_of_study),
          updated_at=now()
      where user_id=v_user_id and university_id=p_university_id;
    return v_university_id;
  end if;

  insert into public.campus_memberships
    (user_id, university_id, faculty, department, course, year_of_study, membership_status, verification_status)
  values
    (v_user_id, p_university_id, nullif(btrim(coalesce(p_faculty,'')), ''),
     nullif(btrim(coalesce(p_department,'')), ''), nullif(btrim(coalesce(p_course,'')), ''),
     nullif(btrim(coalesce(p_year_of_study,'')), ''), 'active', 'unverified')
  returning university_id into v_university_id;
  return v_university_id;
end;
$function$;

revoke all on function public.set_my_campus_membership(uuid,text,text,text,text) from public, anon;
grant execute on function public.set_my_campus_membership(uuid,text,text,text,text) to authenticated;

commit;
