-- Campus-specific staff roles. A global profile role alone must never grant authority over every university.
begin;

alter table public.campus_memberships
  add column if not exists campus_role text not null default 'student';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campus_memberships'::regclass
      and conname='campus_memberships_campus_role_check'
  ) then
    alter table public.campus_memberships
      add constraint campus_memberships_campus_role_check
      check (campus_role in ('student','teacher','security','admin'));
  end if;
end $$;

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.platform_admins enable row level security;
revoke all on table private.platform_admins from public, anon, authenticated;

create or replace function private.current_campus_role()
returns text language sql stable security definer set search_path to ''
as $function$
  select cm.campus_role::text
  from public.profiles p
  join public.campus_memberships cm on cm.user_id=p.id
  where p.id=(select auth.uid())
    and p.verification_status='verified'
    and cm.membership_status='active'
    and cm.verification_status='verified'
  limit 1;
$function$;
revoke all on function private.current_campus_role() from public, anon;
grant execute on function private.current_campus_role() to authenticated;

create or replace function public.bootstrap_first_campus_admin(p_university_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_status text;
  v_existing_university uuid;
begin
  select p.role::text,p.verification_status::text into v_role,v_status
  from public.profiles p where p.id=v_user_id;
  if v_user_id is null or v_role is distinct from 'admin' or v_status is distinct from 'verified' then
    raise exception 'A verified CampusShield platform administrator is required for initial setup.';
  end if;

  if not exists(select 1 from private.platform_admins) then
    insert into private.platform_admins(user_id) values(v_user_id) on conflict do nothing;
  elsif not exists(select 1 from private.platform_admins where user_id=v_user_id) then
    raise exception 'Only the established CampusShield platform administrator can initialize another campus.';
  end if;

  if not exists(select 1 from public.campus_universities where id=p_university_id and is_active) then
    raise exception 'Choose an active university from the directory.';
  end if;
  if exists(select 1 from public.campus_memberships where user_id=v_user_id and university_id<>p_university_id) then
    raise exception 'Your university selection is locked. Use platform administration to assign a separate campus administrator.';
  end if;
  if exists(select 1 from public.campus_memberships where university_id=p_university_id and campus_role='admin' and user_id<>v_user_id and membership_status='active' and verification_status='verified') then
    raise exception 'This university already has an approved campus administrator.';
  end if;

  select cm.university_id into v_existing_university from public.campus_memberships cm where cm.user_id=v_user_id;
  insert into public.campus_memberships(user_id,university_id,campus_role,membership_status,verification_status)
  values(v_user_id,p_university_id,'admin','active','verified')
  on conflict(user_id) do update
    set campus_role='admin',membership_status='active',verification_status='verified',updated_at=now()
    where public.campus_memberships.university_id=excluded.university_id;

  if not exists(select 1 from public.campus_memberships cm where cm.user_id=v_user_id and cm.university_id=p_university_id and cm.campus_role='admin' and cm.membership_status='active' and cm.verification_status='verified') then
    raise exception 'Campus administrator setup failed; contact support.';
  end if;
  return true;
end;
$function$;

create or replace function public.platform_list_campus_staff_candidates(p_university_id uuid)
returns table(user_id uuid,username text,account_role text,account_status text,campus_status text,faculty text,department text)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not exists(select 1 from private.platform_admins where user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  return query
    select p.id,cp.username,p.role::text,p.verification_status::text,cm.verification_status::text,cm.faculty,cm.department
    from public.campus_memberships cm
    join public.profiles p on p.id=cm.user_id
    left join public.community_profiles cp on cp.user_id=p.id
    where cm.university_id=p_university_id and cm.membership_status='active'
      and cm.verification_status in ('unverified','pending','verified')
      and p.verification_status='verified'
      and p.role::text in ('teacher','security','admin')
    order by cp.username;
end;
$function$;

create or replace function public.platform_assign_campus_admin(p_user_id uuid,p_university_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not exists(select 1 from private.platform_admins where user_id=(select auth.uid())) then
    raise exception 'CampusShield platform administrator access is required.';
  end if;
  if not exists(select 1 from public.campus_universities where id=p_university_id and is_active) then
    raise exception 'Choose an active university from the directory.';
  end if;
  if not exists(
    select 1 from public.profiles p
    join public.campus_memberships cm on cm.user_id=p.id
    where p.id=p_user_id and p.verification_status='verified'
      and p.role::text in ('teacher','security','admin')
      and cm.university_id=p_university_id and cm.membership_status='active'
      and cm.verification_status in ('unverified','pending','verified')
  ) then
    raise exception 'Choose an already verified staff account that belongs to the selected university.';
  end if;

  update public.profiles set role='admin' where id=p_user_id;
  update public.campus_memberships
    set campus_role='admin',verification_status='verified',updated_at=now()
    where user_id=p_user_id and university_id=p_university_id and membership_status='active';
  if not found then raise exception 'Campus administrator could not be assigned.'; end if;
end;
$function$;

create or replace function public.review_campus_account(p_user_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
  v_requested_role text;
begin
  select p.role::text,p.verification_status::text into v_admin_role,v_admin_status
  from public.profiles p where p.id=(select auth.uid());
  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified'
     or coalesce(private.current_campus_role(),'')<>'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if not private.user_has_current_campus(p_user_id) then raise exception 'This account is not a member of your university.'; end if;
  select p.requested_role::text into v_requested_role from public.profiles p
  where p.id=p_user_id and p.verification_status::text='pending';
  if not found then raise exception 'Pending account not found.'; end if;
  if v_requested_role not in ('student','teacher') then raise exception 'Only student and teacher requests can be reviewed here.'; end if;

  if p_decision='approve' then
    update public.profiles set role=v_requested_role,verification_status='verified'
    where id=p_user_id and verification_status::text='pending';
    update public.campus_memberships set campus_role=v_requested_role,updated_at=now()
    where user_id=p_user_id and university_id=(select private.current_campus_university_id());
  else
    update public.profiles set verification_status='rejected'
    where id=p_user_id and verification_status::text='pending';
  end if;
  if not found then raise exception 'The account could not be updated.'; end if;
end;
$function$;

create or replace function public.review_campus_staff_membership(p_user_id uuid,p_decision text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_role text;
begin
  if coalesce(private.current_campus_role(),'')<>'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  select p.role::text into v_role
  from public.profiles p join public.campus_memberships cm on cm.user_id=p.id
  where p.id=p_user_id and cm.university_id=(select private.current_campus_university_id())
    and cm.membership_status='active' and cm.verification_status in ('unverified','pending')
    and (p.requested_role='teacher' or p.role::text in ('teacher','security','admin'));
  if not found then raise exception 'This staff membership request is not in your university queue.'; end if;

  update public.campus_memberships
    set verification_status=case p_decision when 'approve' then 'verified' else 'rejected' end,
        campus_role=case when p_decision='approve' then v_role else campus_role end,
        updated_at=now()
  where user_id=p_user_id and university_id=(select private.current_campus_university_id())
    and membership_status='active';
  if not found then raise exception 'Campus membership could not be updated.'; end if;
end;
$function$;

revoke all on function public.bootstrap_first_campus_admin(uuid) from public, anon;
revoke all on function public.platform_list_campus_staff_candidates(uuid) from public, anon;
revoke all on function public.platform_assign_campus_admin(uuid,uuid) from public, anon;
grant execute on function public.bootstrap_first_campus_admin(uuid) to authenticated;
grant execute on function public.platform_list_campus_staff_candidates(uuid) to authenticated;
grant execute on function public.platform_assign_campus_admin(uuid,uuid) to authenticated;

commit;
