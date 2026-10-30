-- CampusShield AI: private image/video attachments for moderated Campus Stories.
-- Reuses the existing private campus-community-media bucket; no public bucket or production change.
begin;

create table if not exists public.campus_story_media (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null unique references public.campus_stories(id) on delete cascade,
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  object_path text not null unique,
  media_kind text not null check (media_kind in ('image','video')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
  byte_size bigint not null check (byte_size between 1 and 52428800),
  alt_text text check (alt_text is null or char_length(btrim(alt_text)) <= 250),
  created_at timestamptz not null default now()
);
create index if not exists campus_story_media_campus_idx
  on public.campus_story_media(university_id,story_id);

alter table public.campus_story_media enable row level security;
revoke all on public.campus_story_media from anon, authenticated;
create policy campus_story_media_no_direct_access
  on public.campus_story_media for all to authenticated
  using (false) with check (false);

create or replace function private.can_upload_campus_story_media(p_object_path text)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select coalesce((select auth.uid()) is not null,false)
    and coalesce((select private.current_user_has_verified_campus_access()),false)
    and split_part(coalesce(p_object_path,''),'/',1)=(select private.current_campus_university_id())::text
    and split_part(coalesce(p_object_path,''),'/',3)<>''
    and exists (
      select 1 from public.campus_stories s
      where s.id::text=split_part(p_object_path,'/',2)
        and s.university_id=(select private.current_campus_university_id())
        and s.author_id=(select auth.uid())
        and s.status='pending'
    )
    and not exists (
      select 1 from public.campus_story_media m
      where m.story_id::text=split_part(p_object_path,'/',2)
    );
$function$;

create or replace function private.can_read_campus_story_media(p_object_path text)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select coalesce((select private.current_user_has_verified_campus_access()),false)
    and split_part(coalesce(p_object_path,''),'/',1)=(select private.current_campus_university_id())::text
    and exists (
      select 1
      from public.campus_story_media m
      join public.campus_stories s on s.id=m.story_id and s.university_id=m.university_id
      where m.object_path=p_object_path
        and m.university_id=(select private.current_campus_university_id())
        and (
          (s.status='published' and s.expires_at>now())
          or (s.status='pending' and (
            s.author_id=(select auth.uid())
            or coalesce((select private.current_campus_role()),'')=any(array['admin','security','teacher']::text[])
          ))
        )
    );
$function$;

create or replace function private.can_delete_campus_story_media(p_object_path text)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select coalesce((select auth.uid()) is not null,false)
    and split_part(coalesce(p_object_path,''),'/',1)=(select private.current_campus_university_id())::text
    and split_part(coalesce(p_object_path,''),'/',3)<>''
    and exists (
      select 1 from public.campus_stories s
      where s.id::text=split_part(p_object_path,'/',2)
        and s.university_id=(select private.current_campus_university_id())
        and s.author_id=(select auth.uid())
        and s.status='pending'
    );
$function$;

revoke all on function private.can_upload_campus_story_media(text) from public,anon;
revoke all on function private.can_read_campus_story_media(text) from public,anon;
revoke all on function private.can_delete_campus_story_media(text) from public,anon;
grant execute on function private.can_upload_campus_story_media(text) to authenticated;
grant execute on function private.can_read_campus_story_media(text) to authenticated;
grant execute on function private.can_delete_campus_story_media(text) to authenticated;

drop policy if exists campus_story_media_upload_own_pending on storage.objects;
create policy campus_story_media_upload_own_pending
  on storage.objects for insert to authenticated
  with check (bucket_id='campus-community-media' and private.can_upload_campus_story_media(name));

drop policy if exists campus_story_media_read_visible_same_campus on storage.objects;
create policy campus_story_media_read_visible_same_campus
  on storage.objects for select to authenticated
  using (bucket_id='campus-community-media' and private.can_read_campus_story_media(name));

drop policy if exists campus_story_media_delete_own_pending on storage.objects;
create policy campus_story_media_delete_own_pending
  on storage.objects for delete to authenticated
  using (bucket_id='campus-community-media' and private.can_delete_campus_story_media(name));

create or replace function public.attach_campus_story_media(
  p_story_id uuid,
  p_object_path text,
  p_media_kind text,
  p_mime_type text,
  p_byte_size bigint,
  p_alt_text text default null
)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_campus uuid := (select private.current_campus_university_id());
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
  if p_byte_size is null or p_byte_size<1 or p_byte_size>52428800 then
    raise exception 'Story media must be 50 MB or smaller.';
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
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='campus-community-media' and o.name=p_object_path
  ) then
    raise exception 'The uploaded story file could not be found.';
  end if;
  insert into public.campus_story_media
    (story_id,university_id,uploader_id,object_path,media_kind,mime_type,byte_size,alt_text)
  values
    (p_story_id,v_campus,v_user,p_object_path,p_media_kind,p_mime_type,p_byte_size,
     nullif(left(btrim(coalesce(p_alt_text,'')),250),''));
end;
$function$;

create or replace function public.list_campus_story_media(p_story_ids uuid[])
returns table(story_id uuid,object_path text,media_kind text,mime_type text,byte_size bigint,alt_text text)
language sql stable security definer set search_path to ''
as $function$
  select m.story_id,m.object_path,m.media_kind,m.mime_type,m.byte_size,m.alt_text
  from public.campus_story_media m
  join public.campus_stories s on s.id=m.story_id and s.university_id=m.university_id
  where m.story_id=any(coalesce(p_story_ids,array[]::uuid[]))
    and m.university_id=(select private.current_campus_university_id())
    and coalesce((select private.current_user_has_verified_campus_access()),false)
    and (
      (s.status='published' and s.expires_at>now())
      or (s.status='pending' and (
        s.author_id=(select auth.uid())
        or coalesce((select private.current_campus_role()),'')=any(array['admin','security','teacher']::text[])
      ))
    )
  order by m.created_at asc
  limit 100;
$function$;

create or replace function public.discard_campus_story_submission(p_story_id uuid)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  delete from public.campus_stories
  where id=p_story_id
    and author_id=(select auth.uid())
    and university_id=(select private.current_campus_university_id())
    and status='pending';
  if not found then
    raise exception 'This pending story can no longer be discarded.';
  end if;
end;
$function$;

revoke all on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) from public,anon;
revoke all on function public.list_campus_story_media(uuid[]) from public,anon;
revoke all on function public.discard_campus_story_submission(uuid) from public,anon;
grant execute on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) to authenticated;
grant execute on function public.list_campus_story_media(uuid[]) to authenticated;
grant execute on function public.discard_campus_story_submission(uuid) to authenticated;

commit;
