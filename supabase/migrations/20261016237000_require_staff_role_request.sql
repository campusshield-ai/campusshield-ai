-- Require an explicit teacher/staff onboarding request before staff verification.
-- This prevents legacy security/admin roles from entering a review path that only promotes requested_role='teacher'.
begin;

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
  v_requested_role text;
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

  select p.requested_role::text into v_requested_role
  from public.profiles p where p.id = v_user_id;
  if v_requested_role is distinct from 'teacher' then
    raise exception 'Staff verification is available only to accounts registered for a teacher or staff role.';
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

revoke all on function public.submit_campus_staff_verification(text,text,text,text,boolean) from public, anon;
grant execute on function public.submit_campus_staff_verification(text,text,text,text,boolean) to authenticated;

commit;
