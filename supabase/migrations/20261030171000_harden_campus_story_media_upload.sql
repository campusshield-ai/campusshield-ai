-- Tighten Campus Stories media uploads: one object per pending story and media-specific size ceilings.
begin;

create index if not exists campus_story_media_uploader_idx
  on public.campus_story_media(uploader_id);

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
    )
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id='campus-community-media'
        and split_part(o.name,'/',1)=split_part(p_object_path,'/',1)
        and split_part(o.name,'/',2)=split_part(p_object_path,'/',2)
    );
$function$;

create or replace function public.attach_campus_story_media(
  p_story_id uuid,p_object_path text,p_media_kind text,p_mime_type text,p_byte_size bigint,p_alt_text text default null
)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid := (select auth.uid()); v_campus uuid := (select private.current_campus_university_id());
begin
  if v_user is null or v_campus is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to attach story media.';
  end if;
  if p_media_kind not in ('image','video') or p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')
     or (p_media_kind='image' and p_mime_type not like 'image/%') or (p_media_kind='video' and p_mime_type not like 'video/%') then
    raise exception 'Use JPG, PNG, WEBP, GIF, MP4 or WEBM media.';
  end if;
  if p_byte_size is null or p_byte_size<1
     or (p_media_kind='image' and p_byte_size>15728640)
     or (p_media_kind='video' and p_byte_size>31457280) then
    raise exception 'Images must be 15 MB or smaller and videos must be 30 MB or smaller.';
  end if;
  if p_object_path is null or split_part(p_object_path,'/',1)<>v_campus::text
     or split_part(p_object_path,'/',2)<>p_story_id::text or split_part(p_object_path,'/',3)='' then
    raise exception 'Story media path is invalid.';
  end if;
  if not exists (select 1 from public.campus_stories s where s.id=p_story_id and s.university_id=v_campus and s.author_id=v_user and s.status='pending') then
    raise exception 'Only your own pending campus story can receive media.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='campus-community-media' and o.name=p_object_path) then
    raise exception 'The uploaded story file could not be found.';
  end if;
  if exists (select 1 from public.campus_story_media m where m.story_id=p_story_id) then
    raise exception 'Only one photo or video can be attached to a story.';
  end if;
  insert into public.campus_story_media(story_id,university_id,uploader_id,object_path,media_kind,mime_type,byte_size,alt_text)
  values(p_story_id,v_campus,v_user,p_object_path,p_media_kind,p_mime_type,p_byte_size,nullif(left(btrim(coalesce(p_alt_text,'')),250),''));
end;
$function$;

revoke all on function private.can_upload_campus_story_media(text) from public,anon;
grant execute on function private.can_upload_campus_story_media(text) to authenticated;
revoke all on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) from public,anon;
grant execute on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) to authenticated;

commit;