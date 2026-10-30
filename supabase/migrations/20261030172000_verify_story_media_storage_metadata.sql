-- Verify server-recorded Storage metadata instead of trusting browser-supplied size and MIME values.
begin;

create or replace function public.attach_campus_story_media(
  p_story_id uuid,p_object_path text,p_media_kind text,p_mime_type text,p_byte_size bigint,p_alt_text text default null
)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_campus uuid := (select private.current_campus_university_id());
  v_actual_size bigint;
  v_actual_mime text;
begin
  if v_user is null or v_campus is null or not coalesce((select private.current_user_has_verified_campus_access()),false) then
    raise exception 'Verified campus access is required to attach story media.';
  end if;
  if p_media_kind not in ('image','video') or p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')
     or (p_media_kind='image' and p_mime_type not like 'image/%') or (p_media_kind='video' and p_mime_type not like 'video/%') then
    raise exception 'Use JPG, PNG, WEBP, GIF, MP4 or WEBM media.';
  end if;
  if p_object_path is null or split_part(p_object_path,'/',1)<>v_campus::text
     or split_part(p_object_path,'/',2)<>p_story_id::text or split_part(p_object_path,'/',3)='' then
    raise exception 'Story media path is invalid.';
  end if;
  if not exists (
    select 1 from public.campus_stories s
    where s.id=p_story_id and s.university_id=v_campus and s.author_id=v_user and s.status='pending'
  ) then
    raise exception 'Only your own pending campus story can receive media.';
  end if;

  select
    case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
    lower(coalesce(o.metadata->>'mimetype',''))
  into v_actual_size,v_actual_mime
  from storage.objects o
  where o.bucket_id='campus-community-media' and o.name=p_object_path
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
end;
$function$;

revoke all on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) from public,anon;
grant execute on function public.attach_campus_story_media(uuid,text,text,text,bigint,text) to authenticated;
commit;