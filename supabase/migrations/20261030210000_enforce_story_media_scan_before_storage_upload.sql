-- Enforce a server-issued clean-scan approval before any authenticated client
-- can write a Campus Story object into the shared private media bucket.
begin;

create table if not exists public.campus_story_media_scan_approvals (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.campus_stories(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
  byte_size bigint not null check (byte_size between 1 and 31457280),
  scan_status text not null check (scan_status='clean'),
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists campus_story_media_scan_approvals_pending_idx
  on public.campus_story_media_scan_approvals(object_path, uploader_id, expires_at)
  where consumed_at is null;

alter table public.campus_story_media_scan_approvals enable row level security;
revoke all on public.campus_story_media_scan_approvals from public, anon, authenticated;
grant all on public.campus_story_media_scan_approvals to service_role;

create or replace function private.can_start_campus_story_media_scan(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select auth.uid()) is not null,false)
    and coalesce((select private.current_user_has_verified_campus_access()),false)
    and exists (
      select 1 from public.campus_stories s
      where s.id=p_story_id
        and s.university_id=(select private.current_campus_university_id())
        and s.author_id=(select auth.uid())
        and s.status='pending'
    )
    and not exists (
      select 1 from public.campus_story_media m where m.story_id=p_story_id
    )
    and not exists (
      select 1 from public.campus_story_media_scan_approvals a
      where a.story_id=p_story_id
        and a.uploader_id=(select auth.uid())
        and a.expires_at>now()
        and a.consumed_at is null
    );
$function$;

create or replace function private.can_upload_campus_story_media(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select auth.uid()) is not null,false)
    and coalesce((select private.current_user_has_verified_campus_access()),false)
    and split_part(coalesce(p_object_path,''),'/',1)=(select private.current_campus_university_id())::text
    and split_part(coalesce(p_object_path,''),'/',3)<>''
    and exists (
      select 1
      from public.campus_story_media_scan_approvals a
      join public.campus_stories s on s.id=a.story_id and s.university_id=a.university_id
      where a.object_path=p_object_path
        and a.story_id::text=split_part(p_object_path,'/',2)
        and a.uploader_id=(select auth.uid())
        and a.university_id=(select private.current_campus_university_id())
        and a.scan_status='clean'
        and a.expires_at>now()
        and a.consumed_at is null
        and s.author_id=(select auth.uid())
        and s.status='pending'
    )
    and not exists (
      select 1 from public.campus_story_media m
      where m.story_id::text=split_part(p_object_path,'/',2)
    );
$function$;

revoke all on function private.can_start_campus_story_media_scan(uuid) from public, anon;
revoke all on function private.can_upload_campus_story_media(text) from public, anon;
grant execute on function private.can_start_campus_story_media_scan(uuid) to authenticated;
grant execute on function private.can_upload_campus_story_media(text) to authenticated;

-- The public preflight means "may begin a scan", not "may write directly".
create or replace function public.can_upload_campus_story_media(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((select private.can_start_campus_story_media_scan(p_story_id)),false);
$function$;
revoke all on function public.can_upload_campus_story_media(uuid) from public, anon;
grant execute on function public.can_upload_campus_story_media(uuid) to authenticated;

-- The general CampusPulse upload rule must not also authorize a Story path.
drop policy if exists campus_media_upload_same_campus on storage.objects;
create policy campus_media_upload_same_campus
  on storage.objects for insert to authenticated
  with check (
    bucket_id='campus-community-media'
    and not exists (
      select 1 from public.campus_stories s
      where s.id::text=split_part(objects.name,'/',2)
        and s.university_id=(select private.current_campus_university_id())
    )
    and split_part(name,'/',1)=(select private.current_campus_university_id())::text
    and (select private.current_user_has_verified_campus_access())
    and private.owns_community_post_for_media(split_part(name,'/',2),(select private.current_campus_university_id()))
  );

-- The platform-owner convenience policy must not create an upload bypass either.
drop policy if exists platform_owner_full_access_user_buckets on storage.objects;
create policy platform_owner_full_access_user_buckets
  on storage.objects for all to authenticated
  using (
    private.is_campusshield_owner_admin()
    and bucket_id=any(array['campus-community-media','campus-profile-avatars','campus-staff-documents','student-identity-documents'])
    and not (
      bucket_id='campus-community-media'
      and exists (
        select 1 from public.campus_stories s
        where s.id::text=split_part(objects.name,'/',2)
          and s.university_id::text=split_part(objects.name,'/',1)
      )
    )
  )
  with check (
    private.is_campusshield_owner_admin()
    and bucket_id=any(array['campus-community-media','campus-profile-avatars','campus-staff-documents','student-identity-documents'])
    and not (
      bucket_id='campus-community-media'
      and exists (
        select 1 from public.campus_stories s
        where s.id::text=split_part(objects.name,'/',2)
          and s.university_id::text=split_part(objects.name,'/',1)
      )
    )
  );

-- Recheck the server-issued approval and actual Storage metadata at attachment time.
create or replace function public.attach_campus_story_media(
  p_story_id uuid,p_object_path text,p_media_kind text,p_mime_type text,p_byte_size bigint,p_alt_text text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_campus uuid := (select private.current_campus_university_id());
  v_approval_id uuid;
  v_actual_size bigint;
  v_actual_mime text;
begin
  if v_user is null or v_campus is null
     or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to attach story media.';
  end if;
  if p_media_kind not in ('image','video')
     or p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')
     or (p_media_kind='image' and p_mime_type not like 'image/%')
     or (p_media_kind='video' and p_mime_type not like 'video/%') then
    raise exception 'Use JPG, PNG, WEBP, GIF, MP4 or WEBM media.';
  end if;
  if p_object_path is null
     or split_part(p_object_path,'/',1)<>v_campus::text
     or split_part(p_object_path,'/',2)<>p_story_id::text
     or split_part(p_object_path,'/',3)='' then
    raise exception 'Story media path is invalid.';
  end if;
  if not exists (
    select 1 from public.campus_stories s
    where s.id=p_story_id and s.university_id=v_campus
      and s.author_id=v_user and s.status='pending'
  ) then
    raise exception 'Only your own pending campus story can receive media.';
  end if;

  select a.id into v_approval_id
  from public.campus_story_media_scan_approvals a
  where a.story_id=p_story_id
    and a.university_id=v_campus
    and a.uploader_id=v_user
    and a.object_path=p_object_path
    and a.mime_type=p_mime_type
    and a.byte_size=p_byte_size
    and a.scan_status='clean'
    and a.expires_at>now()
    and a.consumed_at is null
  for update;
  if v_approval_id is null then
    raise exception 'A current clean malware-scan approval is required before attaching Story media.';
  end if;

  select
    case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
    lower(coalesce(o.metadata->>'mimetype',''))
  into v_actual_size,v_actual_mime
  from storage.objects o
  where o.bucket_id='campus-community-media'
    and o.name=p_object_path
    and o.owner_id=v_user::text;
  if not found or v_actual_size is null or v_actual_mime='' then
    raise exception 'The uploaded media metadata could not be verified.';
  end if;
  if v_actual_mime<>lower(p_mime_type) or v_actual_size<>p_byte_size then
    raise exception 'The uploaded file type or size does not match its Storage metadata.';
  end if;
  if (p_media_kind='image' and (v_actual_mime not like 'image/%' or v_actual_size>15728640))
     or (p_media_kind='video' and (v_actual_mime not like 'video/%' or v_actual_size>31457280))
     or v_actual_size<1 then
    raise exception 'Images must be 15 MB or smaller and videos must be 30 MB or smaller.';
  end if;
  if exists (select 1 from public.campus_story_media m where m.story_id=p_story_id) then
    raise exception 'Only one photo or video can be attached to a story.';
  end if;

  insert into public.campus_story_media(story_id,university_id,uploader_id,object_path,media_kind,mime_type,byte_size,alt_text)
  values(p_story_id,v_campus,v_user,p_object_path,p_media_kind,v_actual_mime,v_actual_size,nullif(left(btrim(coalesce(p_alt_text,'')),250),''));

  update public.campus_story_media_scan_approvals
    set consumed_at=now()
    where id=v_approval_id and consumed_at is null;
  if not found then raise exception 'The malware-scan approval was already consumed.'; end if;
end;
$function$;
revoke all on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) from public, anon;
grant execute on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) to authenticated;

commit;
