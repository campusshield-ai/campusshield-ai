-- CampusShield AI — private student identity verification.
-- Applied on staging as migration version 20261015220432.
-- Keep the identity bucket private and use RLS plus guarded RPCs as the authorization boundary.

begin;

create table if not exists public.student_identity_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  student_number text not null,
  object_path text not null unique,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_identity_verifications_student_number_check
    check (length(btrim(student_number)) between 2 and 80),
  constraint student_identity_verifications_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint student_identity_path_matches_user
    check (object_path = user_id::text || '/student-identity-document')
);

alter table public.student_identity_verifications enable row level security;
revoke all on table public.student_identity_verifications from public, anon, authenticated;
grant select on table public.student_identity_verifications to authenticated;

drop policy if exists student_identity_read_owner_or_campus_admin on public.student_identity_verifications;
create policy student_identity_read_owner_or_campus_admin
  on public.student_identity_verifications for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.current_campus_role() = 'admin'
      and private.user_has_current_campus(user_id)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-identity-documents',
  'student-identity-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'application/pdf']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_identity_upload_own_pending on storage.objects;
create policy student_identity_upload_own_pending
  on storage.objects for insert to authenticated with check (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name = (select auth.uid())::text || '/student-identity-document'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.requested_role::text = 'student'
        and p.verification_status::text = 'pending'
        and (select private.current_campus_university_id()) is not null
        and private.user_has_current_campus((select auth.uid()))
    )
  );

drop policy if exists student_identity_read_own_or_campus_admin on storage.objects;
create policy student_identity_read_own_or_campus_admin
  on storage.objects for select to authenticated using (
    bucket_id = 'student-identity-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        private.current_campus_role() = 'admin'
        and exists (
          select 1 from public.student_identity_verifications siv
          where siv.object_path = objects.name
            and private.user_has_current_campus(siv.user_id)
        )
      )
    )
  );

drop policy if exists student_identity_delete_unsubmitted_own on storage.objects;
create policy student_identity_delete_unsubmitted_own
  on storage.objects for delete to authenticated using (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.student_identity_verifications siv
      where siv.object_path = objects.name
    )
  );

drop policy if exists "Users can read own profile; campus admins can read profiles" on public.profiles;
create policy "Users can read own profile; campus admins can read profiles"
  on public.profiles for select to authenticated using (
    id = (select auth.uid())
    or (
      private.current_campus_role() = 'admin'
      and private.user_has_current_campus(id)
    )
  );

create or replace function private.submit_student_identity_verification(
  p_student_number text,
  p_object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if length(btrim(coalesce(p_student_number, ''))) not between 2 and 80 then
    raise exception 'Student or matric number must be 2–80 characters.';
  end if;
  if p_object_path is distinct from v_user_id::text || '/student-identity-document' then
    raise exception 'The document path must belong to the signed-in account.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.requested_role::text = 'student'
      and p.verification_status::text = 'pending'
  ) then raise exception 'A pending student account is required.'; end if;

  v_university_id := (select private.current_campus_university_id());
  if v_university_id is null or not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id and cm.university_id = v_university_id
      and cm.membership_status::text = 'active'
  ) then raise exception 'Complete campus onboarding before submitting identity.'; end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'student-identity-documents' and o.name = p_object_path
      and o.owner_id = v_user_id::text
      and o.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'application/pdf')
      and (o.metadata->>'size')::bigint between 1 and 5242880
  ) then raise exception 'Upload a supported document before submitting.'; end if;

  insert into public.student_identity_verifications (user_id, university_id, student_number, object_path)
  values (v_user_id, v_university_id, btrim(p_student_number), p_object_path);
exception when unique_violation then
  raise exception 'An identity document has already been submitted for this account.';
end;
$function$;

create or replace function private.review_student_identity_verification(
  p_user_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
begin
  select p.role::text, p.verification_status::text into v_admin_role, v_admin_status
  from public.profiles p where p.id = (select auth.uid());
  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified'
     or coalesce(private.current_campus_role(), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject.'; end if;
  if not private.user_has_current_campus(p_user_id) then
    raise exception 'This account is not a member of your university.';
  end if;

  update public.student_identity_verifications
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      reviewed_by = (select auth.uid()), reviewed_at = now()
  where user_id = p_user_id
    and university_id = (select private.current_campus_university_id())
    and status = 'pending';
  if not found then raise exception 'Pending student identity submission not found.'; end if;
  perform public.review_campus_account(p_user_id, p_decision);
end;
$function$;

create or replace function public.submit_student_identity_verification(p_student_number text, p_object_path text)
returns void language sql set search_path = ''
as $function$ select private.submit_student_identity_verification(p_student_number,p_object_path); $function$;

create or replace function public.review_student_identity_verification(p_user_id uuid, p_decision text)
returns void language sql set search_path = ''
as $function$ select private.review_student_identity_verification(p_user_id,p_decision); $function$;

revoke all on function private.submit_student_identity_verification(text,text) from public, anon;
revoke all on function private.review_student_identity_verification(uuid,text) from public, anon;
grant execute on function private.submit_student_identity_verification(text,text) to authenticated, service_role;
grant execute on function private.review_student_identity_verification(uuid,text) to authenticated, service_role;
revoke all on function public.submit_student_identity_verification(text,text) from public, anon;
revoke all on function public.review_student_identity_verification(uuid,text) from public, anon;
grant execute on function public.submit_student_identity_verification(text,text) to authenticated, service_role;
grant execute on function public.review_student_identity_verification(uuid,text) to authenticated, service_role;

create or replace function public.review_campus_account(p_user_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_role text;
  v_admin_status text;
  v_requested_role text;
begin
  select p.role::text, p.verification_status::text into v_admin_role, v_admin_status
  from public.profiles p where p.id = (select auth.uid());
  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified'
     or coalesce(private.current_campus_role(), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject.'; end if;
  if not private.user_has_current_campus(p_user_id) then
    raise exception 'This account is not a member of your university.';
  end if;

  select p.requested_role::text into v_requested_role
  from public.profiles p where p.id = p_user_id and p.verification_status::text = 'pending';
  if not found then raise exception 'Pending account not found.'; end if;
  if v_requested_role not in ('student', 'teacher') then
    raise exception 'Only student and teacher requests can be reviewed here.';
  end if;
  if p_decision = 'approve' and v_requested_role = 'student' and not exists (
    select 1 from public.student_identity_verifications siv
    where siv.user_id = p_user_id and siv.status = 'approved'
      and siv.university_id = (select private.current_campus_university_id())
  ) then raise exception 'Approve the student identity document before approving this account.'; end if;

  if p_decision = 'approve' then
    update public.profiles set role = v_requested_role, verification_status = 'verified'
    where id = p_user_id and verification_status::text = 'pending';
    update public.campus_memberships set campus_role = v_requested_role, updated_at = now()
    where user_id = p_user_id and university_id = (select private.current_campus_university_id());
  else
    update public.profiles set verification_status = 'rejected'
    where id = p_user_id and verification_status::text = 'pending';
  end if;
  if not found then raise exception 'The account could not be updated.'; end if;
end;
$function$;

revoke all on function public.review_campus_account(uuid,text) from public, anon;
grant execute on function public.review_campus_account(uuid,text) to authenticated, service_role;

commit;