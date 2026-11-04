-- CampusMap passports and verified entrance/accessibility details.
-- Staging-first: uses existing campus_map_features.metadata, current RLS, and verified-campus-admin workflow.
begin;

alter table public.campus_map_features
  drop constraint if exists campus_map_features_feature_type_check;
alter table public.campus_map_features
  add constraint campus_map_features_feature_type_check check (
    feature_type = any (array[
      'building','lecture_hall','hostel','library','cafeteria','medical','security',
      'gate','parking','sports','facility','assembly_point','accessible_entry',
      'emergency_point','entrance'
    ]::text[])
  );

-- Replace the old public wrapper and private implementation so the new metadata
-- is written only through the same verified campus-admin authorization check.
drop function if exists public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean
);
drop function if exists private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean
);

create function private.manage_campus_map_feature_impl(
  p_feature_id uuid,
  p_campus_name text,
  p_campus_slug text,
  p_feature_type text,
  p_name text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_url text,
  p_mark_verified boolean,
  p_publish boolean,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_university_id uuid;
  v_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_parent_id uuid;
  v_item jsonb;
  v_parent_is_published boolean;
begin
  if v_uid is null then raise exception 'Sign in is required.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm
  join public.profiles p on p.id = cm.user_id
  where cm.user_id = v_uid
    and cm.campus_role = 'admin'
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
    and p.role = 'admin'
    and p.verification_status = 'verified'
  limit 1;

  if v_university_id is null then
    raise exception 'A verified campus administrator is required to manage map locations.';
  end if;

  if char_length(btrim(coalesce(p_campus_name,''))) not between 2 and 120
     or coalesce(p_campus_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Choose a valid campus name and campus identifier.';
  end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 180 then
    raise exception 'Location name must be between 2 and 180 characters.';
  end if;
  if coalesce(p_feature_type,'') not in (
    'building','lecture_hall','hostel','library','cafeteria','medical','security',
    'gate','parking','sports','facility','assembly_point','accessible_entry',
    'emergency_point','entrance'
  ) then
    raise exception 'Choose a supported campus location category.';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Enter both latitude and longitude, or leave both blank.';
  end if;
  if p_latitude is not null and (
    p_latitude not between -90 and 90 or p_longitude not between -180 and 180
  ) then
    raise exception 'Coordinates are outside valid geographic ranges.';
  end if;
  if p_source_url is not null and p_source_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Evidence source must be an HTTPS URL.';
  end if;
  if coalesce(p_mark_verified,false) and (p_latitude is null or p_source_url is null) then
    raise exception 'To verify a map point, provide coordinates and an HTTPS evidence source.';
  end if;
  if coalesce(p_publish,false) and not coalesce(p_mark_verified,false) then
    raise exception 'Verify the location before publishing it to students.';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'Campus Passport details must be a JSON object.';
  end if;
  if (v_metadata - array[
    'building_code','opening_hours','floor_count','facilities',
    'accessibility_features','accessibility_notes','building_feature_id',
    'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
  ]::text[]) <> '{}'::jsonb then
    raise exception 'Campus Passport contains an unsupported detail field.';
  end if;

  if v_metadata ? 'building_code' and (
    jsonb_typeof(v_metadata->'building_code') <> 'string'
    or char_length(v_metadata->>'building_code') > 40
  ) then raise exception 'Building code must be plain text up to 40 characters.'; end if;
  if v_metadata ? 'opening_hours' and (
    jsonb_typeof(v_metadata->'opening_hours') <> 'string'
    or char_length(v_metadata->>'opening_hours') > 200
  ) then raise exception 'Opening hours must be plain text up to 200 characters.'; end if;
  if v_metadata ? 'floor_count' and (
    jsonb_typeof(v_metadata->'floor_count') <> 'number'
    or (v_metadata->>'floor_count') !~ '^[0-9]{1,3}$'
    or (v_metadata->>'floor_count')::integer > 100
  ) then raise exception 'Floor count must be a whole number from 0 to 100.'; end if;
  if v_metadata ? 'accessibility_notes' and (
    jsonb_typeof(v_metadata->'accessibility_notes') <> 'string'
    or char_length(v_metadata->>'accessibility_notes') > 500
  ) then raise exception 'Accessibility notes must be plain text up to 500 characters.'; end if;
  if v_metadata ? 'verified_service_note' and (
    jsonb_typeof(v_metadata->'verified_service_note') <> 'string'
    or char_length(v_metadata->>'verified_service_note') > 300
  ) then raise exception 'Service note must be plain text up to 300 characters.'; end if;
  if v_metadata ? 'contact_label' and (
    jsonb_typeof(v_metadata->'contact_label') <> 'string'
    or char_length(v_metadata->>'contact_label') > 60
  ) then raise exception 'Contact label must be plain text up to 60 characters.'; end if;
  if v_metadata ? 'contact_url' and (
    jsonb_typeof(v_metadata->'contact_url') <> 'string'
    or (v_metadata->>'contact_url') !~ '^https://[^[:space:]]+$'
  ) then raise exception 'Contact link must be a valid HTTPS URL.'; end if;
  if v_metadata ? 'emergency_phone' and (
    jsonb_typeof(v_metadata->'emergency_phone') <> 'string'
    or (v_metadata->>'emergency_phone') !~ '^[+0-9() .-]{5,30}$'
  ) then raise exception 'Emergency contact must be a valid public phone number.'; end if;
  if v_metadata ? 'entry_type' and (
    jsonb_typeof(v_metadata->'entry_type') <> 'string'
    or v_metadata->>'entry_type' not in ('main','accessible','service','emergency')
  ) then raise exception 'Choose a supported entrance type.'; end if;

  if v_metadata ? 'facilities' then
    if jsonb_typeof(v_metadata->'facilities') <> 'array'
       or jsonb_array_length(v_metadata->'facilities') > 15 then
      raise exception 'Facilities must be a list of up to 15 items.';
    end if;
    for v_item in select value from jsonb_array_elements(v_metadata->'facilities') as t(value) loop
      if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 60 then
        raise exception 'Each facility must be plain text between 1 and 60 characters.';
      end if;
    end loop;
  end if;

  if v_metadata ? 'accessibility_features' then
    if jsonb_typeof(v_metadata->'accessibility_features') <> 'array'
       or jsonb_array_length(v_metadata->'accessibility_features') > 8 then
      raise exception 'Accessibility features must be a list of up to 8 items.';
    end if;
    for v_item in select value from jsonb_array_elements(v_metadata->'accessibility_features') as t(value) loop
      if jsonb_typeof(v_item) <> 'string'
         or v_item #>> '{}' not in (
           'step_free_entry','ramp','lift','accessible_restroom',
           'tactile_path','accessible_parking','hearing_support'
         ) then
        raise exception 'Choose only supported accessibility features.';
      end if;
    end loop;
  end if;

  if v_metadata ? 'building_feature_id' then
    if jsonb_typeof(v_metadata->'building_feature_id') <> 'string'
       or (v_metadata->>'building_feature_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'The related building reference is invalid.';
    end if;
    v_parent_id := (v_metadata->>'building_feature_id')::uuid;
    select f.is_published and f.verification_status = 'verified'
      into v_parent_is_published
    from public.campus_map_features f
    where f.id = v_parent_id
      and f.university_id = v_university_id
      and f.campus_slug = p_campus_slug
      and f.feature_type in ('building','lecture_hall','hostel','library','facility');
    if not found then
      raise exception 'The entrance must be linked to a building in this university and campus.';
    end if;
    if coalesce(p_publish,false) and not coalesce(v_parent_is_published,false) then
      raise exception 'Publish the verified building before publishing its entrance.';
    end if;
  elsif coalesce(p_publish,false) and p_feature_type in ('entrance','accessible_entry') then
    raise exception 'Link this entrance to a verified campus building before publishing it.';
  end if;

  if p_feature_type = 'entrance' and coalesce(p_publish,false)
     and coalesce(v_metadata->>'entry_type','') not in ('main','service','emergency') then
    raise exception 'Choose whether this is a main, service or emergency entrance before publishing.';
  end if;
  if p_feature_type = 'accessible_entry' and coalesce(p_publish,false)
     and coalesce(v_metadata->>'entry_type','') <> 'accessible' then
    raise exception 'Mark this point as an accessible entrance before publishing it.';
  end if;

  if p_feature_id is not null then
    update public.campus_map_features
    set campus_name = btrim(p_campus_name),
        campus_slug = p_campus_slug,
        feature_type = p_feature_type,
        name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description,'')),''),
        latitude = p_latitude,
        longitude = p_longitude,
        source_url = p_source_url,
        verification_status = case when coalesce(p_mark_verified,false) then 'verified' else 'pending' end,
        verified_by = case when coalesce(p_mark_verified,false) then v_uid else null end,
        verified_at = case when coalesce(p_mark_verified,false) then now() else null end,
        is_published = coalesce(p_publish,false),
        metadata = case when p_metadata is null then metadata else v_metadata end,
        updated_at = now()
    where id = p_feature_id and university_id = v_university_id
    returning id into v_id;
    if v_id is null then raise exception 'This map location does not belong to your university.'; end if;
  else
    insert into public.campus_map_features(
      university_id,campus_name,campus_slug,feature_type,name,description,latitude,longitude,
      source_url,verification_status,verified_by,verified_at,is_published,metadata
    ) values (
      v_university_id,btrim(p_campus_name),p_campus_slug,p_feature_type,btrim(p_name),
      nullif(btrim(coalesce(p_description,'')),''),p_latitude,p_longitude,p_source_url,
      case when coalesce(p_mark_verified,false) then 'verified' else 'pending' end,
      case when coalesce(p_mark_verified,false) then v_uid else null end,
      case when coalesce(p_mark_verified,false) then now() else null end,
      coalesce(p_publish,false),v_metadata
    ) returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

create function public.manage_campus_map_feature(
  p_feature_id uuid default null,
  p_campus_name text default 'Main Campus',
  p_campus_slug text default 'main-campus',
  p_feature_type text default 'building',
  p_name text default null,
  p_description text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_source_url text default null,
  p_mark_verified boolean default false,
  p_publish boolean default false,
  p_metadata jsonb default null
) returns uuid
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );
$wrapper$;

revoke all on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public, anon;
grant execute on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

commit;
