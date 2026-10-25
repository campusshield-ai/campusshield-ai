begin;

alter function public.consume_shieldmind_image_upload() set schema private;
alter function private.consume_shieldmind_image_upload() rename to consume_shieldmind_image_upload_impl;
alter function public.consume_shieldmind_quota() set schema private;
alter function private.consume_shieldmind_quota() rename to consume_shieldmind_quota_impl;
alter function public.get_my_campus_context() set schema private;
alter function private.get_my_campus_context() rename to get_my_campus_context_impl;
alter function public.get_my_community_profile() set schema private;
alter function private.get_my_community_profile() rename to get_my_community_profile_impl;
alter function public.platform_is_admin() set schema private;
alter function private.platform_is_admin() rename to platform_is_admin_impl;
alter function public.review_campus_account(uuid,text) set schema private;
alter function private.review_campus_account(uuid,text) rename to review_campus_account_impl;
alter function public.set_my_campus_membership(uuid,text,text,text,text) set schema private;
alter function private.set_my_campus_membership(uuid,text,text,text,text) rename to set_my_campus_membership_impl;
alter function public.set_my_community_username(text) set schema private;
alter function private.set_my_community_username(text) rename to set_my_community_username_impl;

revoke all on function private.consume_shieldmind_image_upload_impl() from public, anon;
revoke all on function private.consume_shieldmind_quota_impl() from public, anon;
revoke all on function private.get_my_campus_context_impl() from public, anon;
revoke all on function private.get_my_community_profile_impl() from public, anon;
revoke all on function private.platform_is_admin_impl() from public, anon;
revoke all on function private.review_campus_account_impl(uuid,text) from public, anon;
revoke all on function private.set_my_campus_membership_impl(uuid,text,text,text,text) from public, anon;
revoke all on function private.set_my_community_username_impl(text) from public, anon;

grant execute on function private.consume_shieldmind_image_upload_impl() to authenticated;
grant execute on function private.consume_shieldmind_quota_impl() to authenticated;
grant execute on function private.get_my_campus_context_impl() to authenticated;
grant execute on function private.get_my_community_profile_impl() to authenticated;
grant execute on function private.platform_is_admin_impl() to authenticated;
grant execute on function private.review_campus_account_impl(uuid,text) to authenticated;
grant execute on function private.set_my_campus_membership_impl(uuid,text,text,text,text) to authenticated;
grant execute on function private.set_my_community_username_impl(text) to authenticated;

create or replace function public.consume_shieldmind_image_upload()
returns table(allowed boolean, remaining integer)
language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  return query select * from private.consume_shieldmind_image_upload_impl();
end;
$wrapper$;

create or replace function public.consume_shieldmind_quota()
returns table(allowed boolean, remaining integer)
language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  return query select * from private.consume_shieldmind_quota_impl();
end;
$wrapper$;

create or replace function public.get_my_campus_context()
returns table(
  university_id uuid, university_name text, university_slug text, state text, ownership text,
  membership_status text, verification_status text, faculty text, department text, course text, year_of_study text
)
language plpgsql stable security invoker set search_path to ''
as $wrapper$
begin
  return query select * from private.get_my_campus_context_impl();
end;
$wrapper$;

create or replace function public.get_my_community_profile()
returns table(username text, username_changed_at timestamptz)
language plpgsql stable security invoker set search_path to ''
as $wrapper$
begin
  return query select * from private.get_my_community_profile_impl();
end;
$wrapper$;

create or replace function public.platform_is_admin()
returns boolean
language plpgsql stable security invoker set search_path to ''
as $wrapper$
begin
  return private.platform_is_admin_impl();
end;
$wrapper$;

create or replace function public.review_campus_account(p_user_id uuid, p_decision text)
returns void
language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  perform private.review_campus_account_impl(p_user_id, p_decision);
  return;
end;
$wrapper$;

create or replace function public.set_my_campus_membership(
  p_university_id uuid, p_faculty text default null, p_department text default null,
  p_course text default null, p_year_of_study text default null
)
returns uuid
language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  return private.set_my_campus_membership_impl(
    p_university_id, p_faculty, p_department, p_course, p_year_of_study
  );
end;
$wrapper$;

create or replace function public.set_my_community_username(p_username text)
returns text
language plpgsql security invoker set search_path to ''
as $wrapper$
begin
  return private.set_my_community_username_impl(p_username);
end;
$wrapper$;

revoke all on function public.consume_shieldmind_image_upload() from public, anon;
revoke all on function public.consume_shieldmind_quota() from public, anon;
revoke all on function public.get_my_campus_context() from public, anon;
revoke all on function public.get_my_community_profile() from public, anon;
revoke all on function public.platform_is_admin() from public, anon;
revoke all on function public.review_campus_account(uuid,text) from public, anon;
revoke all on function public.set_my_campus_membership(uuid,text,text,text,text) from public, anon;
revoke all on function public.set_my_community_username(text) from public, anon;

grant execute on function public.consume_shieldmind_image_upload() to authenticated;
grant execute on function public.consume_shieldmind_quota() to authenticated;
grant execute on function public.get_my_campus_context() to authenticated;
grant execute on function public.get_my_community_profile() to authenticated;
grant execute on function public.platform_is_admin() to authenticated;
grant execute on function public.review_campus_account(uuid,text) to authenticated;
grant execute on function public.set_my_campus_membership(uuid,text,text,text,text) to authenticated;
grant execute on function public.set_my_community_username(text) to authenticated;

commit;
