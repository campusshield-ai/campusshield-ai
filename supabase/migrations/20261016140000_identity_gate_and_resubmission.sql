-- Enforce verified student identity on campus interactions and allow safe resubmission.
-- Staging-first migration. Official campus notices remain readable to enrolled users;
-- interaction features and incident/helpdesk records require verified access.

begin;

alter table public.student_identity_verifications
  add column if not exists institution_name text,
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default now();

update public.student_identity_verifications siv
set institution_name = coalesce(nullif(btrim(siv.institution_name), ''), u.name),
    updated_at = coalesce(siv.updated_at, siv.created_at, now())
from public.campus_universities u
where u.id = siv.university_id
  and (siv.institution_name is null or btrim(siv.institution_name) = '');

update public.student_identity_verifications
set institution_name = 'Institution name unavailable'
where institution_name is null or btrim(institution_name) = '';

alter table public.student_identity_verifications
  alter column institution_name set not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_identity_verifications'::regclass
      and conname = 'student_identity_institution_name_check'
  ) then
    alter table public.student_identity_verifications
      add constraint student_identity_institution_name_check
      check (char_length(btrim(institution_name)) between 2 and 180);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_identity_verifications'::regclass
      and conname = 'student_identity_rejection_reason_check'
  ) then
    alter table public.student_identity_verifications
      add constraint student_identity_rejection_reason_check
      check (rejection_reason is null or char_length(btrim(rejection_reason)) between 5 and 1000);
  end if;
end
$constraints$;

-- Canonical server-side access check. Students must have both a verified account
-- and an approved identity record for their active campus. Staff need a verified
-- campus membership/role. Merely hiding browser controls is not authorization.
create or replace function private.current_user_has_verified_campus_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.verification_status = 'verified'
      and (
        (
          (p.requested_role = 'student' or p.role = 'student')
          and exists (
            select 1
            from public.student_identity_verifications siv
            where siv.user_id = p.id
              and siv.university_id = (select private.current_campus_university_id())
              and siv.status = 'approved'
          )
        )
        or (
          p.role in ('teacher','security','admin')
          and coalesce((select private.current_campus_role()), '') in ('teacher','security','admin')
        )
      )
  );
$function$;

revoke all on function private.current_user_has_verified_campus_access() from public, anon;
grant execute on function private.current_user_has_verified_campus_access() to authenticated, service_role;

create or replace function private.enforce_verified_campus_access_for_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not (select private.current_user_has_verified_campus_access()) then
    raise exception 'Verify your student identity and wait for account approval before using campus interactions.';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_verified_campus_access_for_interaction() from public, anon, authenticated;
grant execute on function private.enforce_verified_campus_access_for_interaction() to service_role;

-- These triggers also protect writes performed through SECURITY DEFINER RPCs.
do $install_triggers$
declare
  v_table text;
  v_tables text[] := array[
    'public.incidents',
    'public.campus_helpdesk_tickets',
    'public.campus_helpdesk_ticket_updates',
    'public.community_posts',
    'public.community_comments',
    'public.community_post_reactions',
    'public.community_post_bookmarks',
    'public.community_poll_votes',
    'public.community_groups',
    'public.campus_groups',
    'public.campus_group_members',
    'public.campus_events',
    'public.campus_event_rsvps',
    'public.campus_marketplace_listings',
    'public.campus_marketplace_reports',
    'public.campus_follows',
    'public.community_reports',
    'public.community_post_media'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(v_table) is not null then
      execute format('drop trigger if exists enforce_verified_campus_access on %s', v_table);
      execute format(
        'create trigger enforce_verified_campus_access before insert or update on %s for each row execute function private.enforce_verified_campus_access_for_interaction()',
        v_table
      );
    end if;
  end loop;
end
$install_triggers$;

-- Restrictive SELECT policies add an AND gate to existing tenant/owner policies.
-- Pending users may still view official campus notices for important university
-- information, but cannot read case records or participate in CampusPulse until approved.
do $install_read_gates$
declare
  v_table text;
  v_tables text[] := array[
    'public.incidents',
    'public.campus_helpdesk_tickets',
    'public.campus_helpdesk_ticket_updates',
    'public.community_posts',
    'public.community_comments',
    'public.community_post_reactions',
    'public.community_post_bookmarks',
    'public.community_poll_votes',
    'public.campus_groups',
    'public.campus_group_members',
    'public.campus_events',
    'public.campus_event_rsvps',
    'public.campus_marketplace_listings',
    'public.campus_marketplace_reports',
    'public.campus_follows',
    'public.community_reports',
    'public.community_post_media'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(v_table) is not null then
      execute format('drop policy if exists campus_identity_verified_read_gate on %s', v_table);
      execute format(
        'create policy campus_identity_verified_read_gate on %s as restrictive for select to authenticated using ((select private.current_user_has_verified_campus_access()))',
        v_table
      );
    end if;
  end loop;
end
$install_read_gates$;

-- Permit an owner to replace a rejected ID document, but not delete an active
-- or approved submission. This is required for a same-path, safely controlled retry.
drop policy if exists student_identity_delete_unsubmitted_own on storage.objects;
create policy student_identity_delete_unsubmitted_or_rejected_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-identity-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not exists (
        select 1 from public.student_identity_verifications siv
        where siv.object_path = storage.objects.name
      )
      or exists (
        select 1 from public.student_identity_verifications siv
        where siv.object_path = storage.objects.name
          and siv.user_id = (select auth.uid())
          and siv.status = 'rejected'
      )
    )
  );

-- Replace the old two-argument submission path with an institution-aware version.
drop function if exists public.submit_student_identity_verification(text,text);
drop function if exists private.submit_student_identity_verification(text,text);

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
  v_university_id uuid := (select private.current_campus_university_id());
  v_institution_name text;
  v_changed integer;
  v_file_name text;
  v_mime text;
  v_size bigint;
begin
  if v_user_id is null then raise exception 'Sign in before submitting student identity.'; end if;
  if char_length(btrim(coalesce(p_student_number,''))) not between 2 and 80 then
    raise exception 'Student or matric number must be 2–80 characters.';
  end if;
  if char_length(btrim(coalesce(p_institution_name,''))) not between 2 and 180 then
    raise exception 'Institution name must be 2–180 characters.';
  end if;
  if v_university_id is null then raise exception 'Complete campus onboarding before submitting identity.'; end if;

  select u.name into v_institution_name
  from public.campus_universities u where u.id = v_university_id;
  if v_institution_name is null or lower(btrim(p_institution_name)) <> lower(btrim(v_institution_name)) then
    raise exception 'Institution must match the selected university.';
  end if;

  if p_object_path is distinct from v_user_id::text || '/student-identity-document' then
    raise exception 'The document path must belong to the signed-in account.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.requested_role = 'student'
      and p.verification_status = 'pending'
  ) then
    raise exception 'A pending student account is required to submit identity.';
  end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id = v_user_id
      and cm.university_id = v_university_id
      and cm.membership_status = 'active'
  ) then
    raise exception 'An active membership in your selected university is required.';
  end if;

  select lower(o.name), coalesce(o.metadata->>'mimetype',''),
         coalesce(nullif(o.metadata->>'size','')::bigint,0)
  into v_file_name, v_mime, v_size
  from storage.objects o
  where o.bucket_id = 'student-identity-documents'
    and o.name = p_object_path
    and o.owner_id = v_user_id::text;

  if not found or v_size not between 1 and 5242880 then
    raise exception 'Upload a JPEG, PNG or PDF no larger than 5 MiB first.';
  end if;
  if not (
    (v_file_name = lower(p_object_path) and v_mime in ('image/jpeg','image/png','application/pdf'))
  ) then
    raise exception 'The uploaded identity document type is not allowed.';
  end if;

  insert into public.student_identity_verifications
    (user_id, university_id, institution_name, student_number, object_path, status,
     rejection_reason, reviewed_by, reviewed_at, created_at, updated_at)
  values
    (v_user_id, v_university_id, btrim(v_institution_name), btrim(p_student_number),
     p_object_path, 'pending', null, null, null, now(), now())
  on conflict (user_id) do update
    set university_id = excluded.university_id,
        institution_name = excluded.institution_name,
        student_number = excluded.student_number,
        object_path = excluded.object_path,
        status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null,
        created_at = now(),
        updated_at = now()
    where student_identity_verifications.status = 'rejected';

  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'A pending or approved identity submission already exists.';
  end if;
end;
$function$;

-- Rejection returns the identity case to the student for correction but does not
-- reject/lock the whole account. Only approval performs the account approval RPC.
drop function if exists public.review_student_identity_verification(uuid,text);
drop function if exists private.review_student_identity_verification(uuid,text);

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
begin
  select p.role::text, p.verification_status::text
  into v_admin_role, v_admin_status
  from public.profiles p where p.id = (select auth.uid());

  if v_admin_role is distinct from 'admin'
     or v_admin_status is distinct from 'verified'
     or coalesce(private.current_campus_role(), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if not private.user_has_current_campus(p_user_id) then
    raise exception 'This account is not a member of your university.';
  end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'A rejection reason of 5–1000 characters is required.';
  end if;
  if p_decision = 'approve' and p_rejection_reason is not null then
    p_rejection_reason := null;
  end if;

  update public.student_identity_verifications
  set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      rejection_reason = case when p_decision = 'reject' then btrim(p_rejection_reason) else null end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where user_id = p_user_id
    and university_id = (select private.current_campus_university_id())
    and status = 'pending';
  if not found then raise exception 'Pending student identity submission not found.'; end if;

  if p_decision = 'approve' then
    perform public.review_campus_account(p_user_id, 'approve');
  else
    update public.profiles
    set verification_status = 'pending'
    where id = p_user_id
      and requested_role = 'student'
      and verification_status = 'pending';
    if not found then raise exception 'Student account could not be returned to pending verification.'; end if;
  end if;
end;
$function$;

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

revoke all on function private.submit_student_identity_verification(text,text,text) from public, anon;
grant execute on function private.submit_student_identity_verification(text,text,text) to authenticated, service_role;
revoke all on function private.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function private.review_student_identity_verification(uuid,text,text) to authenticated, service_role;
revoke all on function public.submit_student_identity_verification(text,text,text) from public, anon;
grant execute on function public.submit_student_identity_verification(text,text,text) to authenticated, service_role;
revoke all on function public.review_student_identity_verification(uuid,text,text) from public, anon;
grant execute on function public.review_student_identity_verification(uuid,text,text) to authenticated, service_role;

-- Campus media uploads must pass the same identity gate; notices deliberately do not.
drop policy if exists campus_media_upload_same_campus on storage.objects;
create policy campus_media_upload_same_campus
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-community-media'
    and split_part(name, '/', 1) = (select private.current_campus_university_id())::text
    and (select private.current_user_has_verified_campus_access())
    and private.owns_community_post_for_media(
      split_part(name, '/', 2),
      (select private.current_campus_university_id())
    )
  );

commit;
