-- CampusShield AI production: student identity verification gate.
-- Production currently uses the legacy single-campus schema. This migration is
-- intentionally compatible with its existing public.profiles/incidents/community tables.
-- It does not add campus-university dependencies or store names/emails in the identity table.

begin;

create table if not exists public.student_identity_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  institution_name text not null,
  student_number text not null,
  object_path text not null unique,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_identity_institution_length
    check (char_length(btrim(institution_name)) between 2 and 180),
  constraint student_identity_number_length
    check (char_length(btrim(student_number)) between 2 and 80),
  constraint student_identity_status_check
    check (status in ('pending','approved','rejected')),
  constraint student_identity_safe_path_check
    check (object_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|pdf)$'),
  constraint student_identity_rejection_reason_length
    check (rejection_reason is null or char_length(rejection_reason) <= 1000)
);

alter table public.student_identity_verifications enable row level security;
revoke all on table public.student_identity_verifications from public, anon, authenticated;
grant select on table public.student_identity_verifications to authenticated;

drop policy if exists student_identity_read_own_or_verified_admin
  on public.student_identity_verifications;
create policy student_identity_read_own_or_verified_admin
  on public.student_identity_verifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles administrator
      where administrator.id = (select auth.uid())
        and administrator.role = 'admin'
        and administrator.verification_status = 'verified'
    )
  );

-- Keep the existing bucket private and enforce the 5 MiB app limit at Storage too.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','application/pdf']::text[]
where id = 'student-identity-documents';

-- An upload is allowed only to the student's own UUID folder, with an opaque,
-- UUID filename and a pending student application. No upsert can overwrite a prior ID.
drop policy if exists "Students upload identity documents to own folder" on storage.objects;
drop policy if exists student_identity_upload_own_pending on storage.objects;
create policy student_identity_upload_own_pending
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|pdf)$')
    and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','application/pdf')
    and coalesce(nullif(metadata->>'size','')::bigint,0) between 1 and 5242880
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'student'
        and p.requested_role = 'student'
        and p.verification_status in ('pending','verified')
    )
  );

-- Students can view only their own ID file. Admins can view only an ID file
-- referenced by an identity record, not arbitrary/orphaned objects in the bucket.
drop policy if exists "Users read only own identity documents" on storage.objects;
drop policy if exists student_identity_read_own_or_verified_admin on storage.objects;
drop policy if exists "Verified admins review identity documents" on storage.objects;
create policy student_identity_read_own_or_verified_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'student-identity-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        exists (
          select 1 from public.profiles administrator
          where administrator.id = (select auth.uid())
            and administrator.role = 'admin'
            and administrator.verification_status = 'verified'
        )
        and exists (
          select 1 from public.student_identity_verifications siv
          where siv.object_path = objects.name
        )
      )
    )
  );

-- Permit cleanup only of an unreferenced object in the owner's own UUID folder.
drop policy if exists student_identity_delete_own_unreferenced on storage.objects;
create policy student_identity_delete_own_unreferenced
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.student_identity_verifications siv
      where siv.object_path = objects.name
    )
  );

-- This helper is callable only by authenticated users and only reports whether
-- the current user's restricted features are available. It cannot probe other IDs.
create or replace function private.current_user_can_use_restricted_features()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select case
      when p.verification_status <> 'verified' then false
      when p.role in ('admin','security','teacher') then true
      when p.role = 'student' then exists (
        select 1 from public.student_identity_verifications siv
        where siv.user_id = p.id and siv.status = 'approved'
      )
      else false
    end
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$function$;
revoke all on function private.current_user_can_use_restricted_features() from public, anon;
grant execute on function private.current_user_can_use_restricted_features() to authenticated;

create or replace function private.submit_student_identity_verification(
  p_institution_name text,
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
  v_changed integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before submitting student identity.';
  end if;
  if char_length(btrim(coalesce(p_institution_name,''))) not between 2 and 180 then
    raise exception 'Institution name must be 2–180 characters.';
  end if;
  if char_length(btrim(coalesce(p_student_number,''))) not between 2 and 80 then
    raise exception 'Student or matric number must be 2–80 characters.';
  end if;
  if p_object_path is null or p_object_path !~ (
    '^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|pdf)$'
  ) then
    raise exception 'The document path must be a safe filename in your own folder.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'student'
      and p.requested_role = 'student'
      and p.verification_status in ('pending','verified')
  ) then
    raise exception 'A pending or previously verified student account is required.';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'student-identity-documents'
      and o.name = p_object_path
      and o.metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')
      and coalesce(nullif(o.metadata->>'size','')::bigint,0) between 1 and 5242880
  ) then
    raise exception 'Upload a supported JPEG, PNG or PDF no larger than 5 MiB before submitting.';
  end if;

  insert into public.student_identity_verifications
    (user_id,institution_name,student_number,object_path,status,rejection_reason,reviewed_by,reviewed_at,created_at,updated_at)
  values
    (v_user_id,btrim(p_institution_name),btrim(p_student_number),p_object_path,'pending',null,null,null,now(),now())
  on conflict (user_id) do update
    set institution_name = excluded.institution_name,
        student_number = excluded.student_number,
        object_path = excluded.object_path,
        status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now(),
        updated_at = now()
    where public.student_identity_verifications.status = 'rejected';

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'An identity submission is already pending or has been approved.';
  end if;

  -- Legacy verified student accounts must re-enter review before using student features.
  update public.profiles
  set verification_status = 'pending'
  where id = v_user_id
    and role = 'student'
    and requested_role = 'student'
    and verification_status in ('pending','verified');
  if not found then
    raise exception 'Student account status changed; refresh and try again.';
  end if;
end;
$function$;
revoke all on function private.submit_student_identity_verification(text,text,text) from public, anon;
grant execute on function private.submit_student_identity_verification(text,text,text) to authenticated;

create or replace function private.review_student_identity_verification(
  p_user_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
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
  select p.role::text,p.verification_status::text
  into v_admin_role,v_admin_status
  from public.profiles p
  where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified' then
    raise exception 'Only a verified administrator can review student identity.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;
  if p_decision = 'reject'
     and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'Provide a rejection reason between 5 and 1000 characters.';
  end if;

  select p.requested_role::text
  into v_requested_role
  from public.profiles p
  where p.id = p_user_id
    and p.role = 'student'
    and p.requested_role = 'student'
    and p.verification_status = 'pending'
  for update;

  if not found or v_requested_role is distinct from 'student' then
    raise exception 'Pending student application not found.';
  end if;
  if not exists (
    select 1 from public.student_identity_verifications siv
    where siv.user_id = p_user_id and siv.status = 'pending'
  ) then
    raise exception 'Pending student identity submission not found.';
  end if;

  if p_decision = 'approve' then
    update public.student_identity_verifications
    set status = 'approved',
        rejection_reason = null,
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id and status = 'pending';

    update public.profiles
    set role = 'student',
        verification_status = 'verified'
    where id = p_user_id
      and role = 'student'
      and requested_role = 'student'
      and verification_status = 'pending';
    if not found then
      raise exception 'Student account could not be approved.';
    end if;
  else
    update public.student_identity_verifications
    set status = 'rejected',
        rejection_reason = btrim(p_rejection_reason),
        reviewed_by = (select auth.uid()),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id and status = 'pending';
    -- Keep the account pending so the student can sign in and resubmit safely.
  end if;
end;
$function$;
revoke all on function private.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function private.review_student_identity_verification(uuid,text,text) to authenticated;

create or replace function public.submit_student_identity_verification(
  p_institution_name text,
  p_student_number text,
  p_object_path text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.submit_student_identity_verification($1,$2,$3);
$function$;

create or replace function public.review_student_identity_verification(
  p_user_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.review_student_identity_verification($1,$2,$3);
$function$;
revoke all on function public.submit_student_identity_verification(text,text,text) from public, anon;
revoke all on function public.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function public.submit_student_identity_verification(text,text,text) to authenticated;
grant execute on function public.review_student_identity_verification(uuid,text,text) to authenticated;

-- Existing account approval is retained, but a student cannot be approved from
-- the generic button unless the private identity record is approved.
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
  select p.role::text,p.verification_status::text
  into v_admin_role,v_admin_status
  from public.profiles p
  where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin' or v_admin_status is distinct from 'verified' then
    raise exception 'Only verified administrators may review accounts.';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  select p.requested_role::text
  into v_requested_role
  from public.profiles p
  where p.id = p_user_id and p.verification_status = 'pending'
  for update;

  if not found then raise exception 'Pending account not found.'; end if;
  if v_requested_role not in ('student','teacher') then
    raise exception 'Only student and teacher requests can be reviewed here.';
  end if;

  if p_decision = 'approve' and v_requested_role = 'student'
     and not exists (
       select 1 from public.student_identity_verifications siv
       where siv.user_id = p_user_id and siv.status = 'approved'
     ) then
    raise exception 'Student identity must be approved before account approval.';
  end if;

  if p_decision = 'approve' then
    update public.profiles
    set role = v_requested_role, verification_status = 'verified'
    where id = p_user_id and verification_status = 'pending';
  else
    update public.profiles
    set verification_status = 'rejected'
    where id = p_user_id and verification_status = 'pending';
  end if;

  if not found then raise exception 'The account could not be updated.'; end if;
end;
$function$;

-- Do not allow students without an approved ID to post, comment, or submit
-- new incident records by bypassing the UI.
drop policy if exists "Signed-in non-rejected users can submit their own incidents" on public.incidents;
create policy "Verified users can submit their own incidents"
  on public.incidents for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (select private.current_user_can_use_restricted_features())
  );

drop policy if exists community_posts_read_published_or_staff on public.community_posts;
create policy community_posts_read_published_or_staff
  on public.community_posts for select to authenticated
  using (
    (select private.current_user_can_use_restricted_features())
    and (
      status = 'published'
      or (select private.current_campus_role()) = any (array['admin','security','teacher'])
    )
  );

drop policy if exists community_comments_read_published_or_staff on public.community_comments;
create policy community_comments_read_published_or_staff
  on public.community_comments for select to authenticated
  using (
    (select private.current_user_can_use_restricted_features())
    and (
      (status = 'published' and exists (
        select 1 from public.community_posts p
        where p.id = community_comments.post_id and p.status = 'published'
      ))
      or (select private.current_campus_role()) = any (array['admin','security','teacher'])
    )
  );

create or replace function public.create_community_post(
  p_post_type text,
  p_title text,
  p_body text,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_verification_status text;
  v_username text;
  v_post_id uuid;
  v_is_official boolean := false;
  v_status text := 'pending';
begin
  if v_user_id is null then
    raise exception 'Sign in before posting to the community.';
  end if;

  select p.role::text,p.verification_status::text
  into v_role,v_verification_status
  from public.profiles p
  where p.id = v_user_id;

  if not found or v_verification_status = 'rejected' then
    raise exception 'This account cannot post to the community.';
  end if;
  if v_verification_status not in ('pending','verified') then
    raise exception 'This account cannot post to the community.';
  end if;
  if not private.current_user_can_use_restricted_features() then
    raise exception 'Verify your student identity and account before using the campus community.';
  end if;

  if p_post_type not in ('safety_issue','suggestion','announcement') then
    raise exception 'Choose a valid community post type.';
  end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 then
    raise exception 'The title must be 3–100 characters.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 10 and 2000 then
    raise exception 'The post must be 10–2000 characters.';
  end if;
  if p_location is not null and char_length(btrim(p_location)) > 120 then
    raise exception 'The location must be 120 characters or fewer.';
  end if;

  if p_post_type = 'announcement' then
    if v_verification_status <> 'verified' or v_role not in ('admin','security','teacher') then
      raise exception 'Only verified campus staff can publish official announcements.';
    end if;
    v_is_official := true;
    v_status := 'published';
  end if;

  select cp.username into v_username
  from public.community_profiles cp
  where cp.user_id = v_user_id;
  if v_username is null then
    raise exception 'Your public username is not ready yet. Refresh and try again.';
  end if;

  insert into public.community_posts
    (author_id,author_username,post_type,title,body,location,status,is_official)
  values
    (v_user_id,v_username,p_post_type,btrim(p_title),btrim(p_body),
     nullif(btrim(coalesce(p_location,'')),''),v_status,v_is_official)
  returning id into v_post_id;
  return v_post_id;
end;
$function$;

create or replace function public.create_community_comment(p_post_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_username text;
  v_verification_status text;
  v_comment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in before commenting.';
  end if;

  select p.verification_status::text
  into v_verification_status
  from public.profiles p where p.id = v_user_id;

  if v_verification_status not in ('pending','verified') then
    raise exception 'This account cannot comment.';
  end if;
  if not private.current_user_can_use_restricted_features() then
    raise exception 'Verify your student identity and account before commenting.';
  end if;
  if char_length(btrim(coalesce(p_body,''))) not between 2 and 800 then
    raise exception 'Comments must be 2–800 characters.';
  end if;
  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id and p.status = 'published'
  ) then
    raise exception 'This community post is not available for comments.';
  end if;

  select cp.username into v_username
  from public.community_profiles cp where cp.user_id = v_user_id;
  if v_username is null then
    raise exception 'Your public username is not ready yet. Refresh and try again.';
  end if;

  insert into public.community_comments (post_id,author_id,author_username,body,status)
  values (p_post_id,v_user_id,v_username,btrim(p_body),'published')
  returning id into v_comment_id;
  return v_comment_id;
end;
$function$;

commit;
