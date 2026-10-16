-- CampusShield AI staff identity verification and campus-scoped authority.
-- A claimed title never grants administrator access; campus admin assignment remains a separate trusted action.
begin;

create table if not exists public.campus_staff_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete restrict,
  position_title text not null check (char_length(btrim(position_title)) between 2 and 120),
  staff_number text check (staff_number is null or char_length(btrim(staff_number)) between 2 and 80),
  official_email text check (official_email is null or (char_length(btrim(official_email)) between 5 and 254 and position('@' in official_email) > 1)),
  document_path text,
  requested_campus_admin boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_staff_verification_evidence_check check (
    document_path is not null or official_email is not null or staff_number is not null
  ),
  constraint campus_staff_verification_path_check check (
    document_path is null or document_path like user_id::text || '/%'
  )
);

alter table public.campus_staff_verifications enable row level security;
revoke all on table public.campus_staff_verifications from public, anon, authenticated;
grant select on table public.campus_staff_verifications to authenticated;

drop policy if exists campus_staff_verification_read_own on public.campus_staff_verifications;
create policy campus_staff_verification_read_own
  on public.campus_staff_verifications for select to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-staff-documents', 'campus-staff-documents', false, 5242880,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
set public = false, file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

drop policy if exists campus_staff_document_upload_own on storage.objects;
create policy campus_staff_document_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-staff-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('pdf','jpg','jpeg','png')
  );

drop policy if exists campus_staff_document_read_owner_or_campus_admin on storage.objects;
create policy campus_staff_document_read_owner_or_campus_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campus-staff-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.campus_staff_verifications v
        where v.document_path = storage.objects.name
          and v.university_id = (select private.current_campus_university_id())
          and coalesce((select private.current_campus_role()), '') = 'admin'
      )
    )
  );

drop policy if exists campus_staff_document_delete_own_rejected on storage.objects;
create policy campus_staff_document_delete_own_rejected
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'campus-staff-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.campus_staff_verifications v
      where v.user_id = (select auth.uid())
        and v.document_path = storage.objects.name
        and v.status = 'rejected'
    )
  );

create or replace function public.submit_campus_staff_verification(
  p_position_title text,
  p_staff_number text default null,
  p_official_email text default null,
  p_document_path text default null,
  p_requested_campus_admin boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_university_id uuid := (select private.current_campus_university_id());
  v_document_ok boolean := false;
  v_role text;
begin
  if v_user_id is null then raise exception 'Sign in before submitting staff verification.'; end if;
  if v_university_id is null then raise exception 'Choose your university during account creation before submitting staff verification.'; end if;
  if char_length(btrim(coalesce(p_position_title,''))) not between 2 and 120 then
    raise exception 'Enter your official position in the university.';
  end if;
  if nullif(btrim(coalesce(p_staff_number,'')), '') is null
     and nullif(btrim(coalesce(p_official_email,'')), '') is null
     and nullif(btrim(coalesce(p_document_path,'')), '') is null then
    raise exception 'Provide a staff number, official university email, or staff ID document.';
  end if;
  if nullif(btrim(coalesce(p_official_email,'')), '') is not null
     and (char_length(btrim(p_official_email)) > 254 or position('@' in p_official_email) < 2) then
    raise exception 'Enter a valid official university email address.';
  end if;
  if p_document_path is not null then
    if p_document_path not like v_user_id::text || '/%' then
      raise exception 'The staff document must be uploaded to your own private folder.';
    end if;
    select exists (
      select 1 from storage.objects o
      where o.bucket_id = 'campus-staff-documents'
        and o.name = p_document_path
        and o.owner_id = v_user_id::text
        and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png')
        and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 5242880
    ) into v_document_ok;
    if not v_document_ok then raise exception 'The private staff ID document was not found or is not an allowed file.'; end if;
  end if;

  select p.requested_role::text into v_role
  from public.profiles p where p.id = v_user_id;
  if v_role is distinct from 'teacher' and not exists (
    select 1 from public.profiles p where p.id=v_user_id and p.role::text in ('teacher','security','admin')
  ) then
    raise exception 'This account has not requested a teacher or staff role.';
  end if;
  if not exists (
    select 1 from public.campus_memberships cm
    where cm.user_id=v_user_id and cm.university_id=v_university_id
      and cm.membership_status='active'
  ) then raise exception 'Your campus membership is missing or does not match your selected university.'; end if;

  insert into public.campus_staff_verifications
    (user_id, university_id, position_title, staff_number, official_email, document_path,
     requested_campus_admin, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at)
  values
    (v_user_id, v_university_id, btrim(p_position_title),
     nullif(btrim(coalesce(p_staff_number,'')), ''),
     nullif(lower(btrim(coalesce(p_official_email,''))), ''),
     nullif(btrim(coalesce(p_document_path,'')), ''),
     coalesce(p_requested_campus_admin,false), 'pending', null, null, null, now(), now())
  on conflict (user_id) do update
    set position_title=excluded.position_title,
        staff_number=excluded.staff_number,
        official_email=excluded.official_email,
        document_path=excluded.document_path,
        requested_campus_admin=excluded.requested_campus_admin,
        status='pending', rejection_reason=null, reviewed_by=null, reviewed_at=null, updated_at=now()
    where public.campus_staff_verifications.status='rejected';
  if not found then raise exception 'A staff verification is already pending or approved.'; end if;

  update public.campus_memberships
    set verification_status='pending', updated_at=now()
  where user_id=v_user_id and university_id=v_university_id and membership_status='active';
end;
$function$;

create or replace function public.list_campus_staff_verification_reviews()
returns table (
  user_id uuid,
  username text,
  position_title text,
  staff_number text,
  official_email text,
  document_path text,
  requested_campus_admin boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  return query
    select v.user_id, cp.username, v.position_title, v.staff_number,
           v.official_email, v.document_path, v.requested_campus_admin, v.created_at
    from public.campus_staff_verifications v
    left join public.community_profiles cp on cp.user_id=v.user_id
    where v.university_id=(select private.current_campus_university_id())
      and v.status='pending'
    order by v.created_at asc;
end;
$function$;

create or replace function public.review_campus_staff_verification(
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
  v_university_id uuid := (select private.current_campus_university_id());
  v_requested_role text;
begin
  if coalesce((select private.current_campus_role()), '') <> 'admin' then
    raise exception 'A verified administrator for this university is required.';
  end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject.'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_rejection_reason,''))) not between 5 and 1000 then
    raise exception 'Give a short reason so the staff member can correct the application.';
  end if;

  select p.requested_role::text into v_requested_role
  from public.campus_staff_verifications v
  join public.profiles p on p.id=v.user_id
  join public.campus_memberships cm on cm.user_id=v.user_id
  where v.user_id=p_user_id and v.university_id=v_university_id and v.status='pending'
    and cm.university_id=v_university_id and cm.membership_status='active';
  if not found then raise exception 'Pending staff verification not found for your university.'; end if;

  update public.campus_staff_verifications
    set status=case when p_decision='approve' then 'approved' else 'rejected' end,
        rejection_reason=case when p_decision='reject' then btrim(p_rejection_reason) else null end,
        reviewed_by=(select auth.uid()), reviewed_at=now(), updated_at=now()
    where user_id=p_user_id and university_id=v_university_id and status='pending';

  if p_decision='approve' then
    update public.profiles set role='teacher', verification_status='verified'
    where id=p_user_id and requested_role='teacher';
    if not found then raise exception 'Staff account role could not be verified.'; end if;
    update public.campus_memberships
      set campus_role='teacher', verification_status='verified', updated_at=now()
      where user_id=p_user_id and university_id=v_university_id and membership_status='active';
    if not found then raise exception 'Staff campus membership could not be verified.'; end if;
  else
    update public.profiles set verification_status='pending'
    where id=p_user_id and requested_role='teacher';
    update public.campus_memberships
      set verification_status='rejected', updated_at=now()
      where user_id=p_user_id and university_id=v_university_id and membership_status='active';
  end if;
end;
$function$;

revoke all on function public.submit_campus_staff_verification(text,text,text,text,boolean) from public, anon;
revoke all on function public.list_campus_staff_verification_reviews() from public, anon;
revoke all on function public.review_campus_staff_verification(uuid,text,text) from public, anon;
grant execute on function public.submit_campus_staff_verification(text,text,text,text,boolean) to authenticated;
grant execute on function public.list_campus_staff_verification_reviews() to authenticated;
grant execute on function public.review_campus_staff_verification(uuid,text,text) to authenticated;

commit;
