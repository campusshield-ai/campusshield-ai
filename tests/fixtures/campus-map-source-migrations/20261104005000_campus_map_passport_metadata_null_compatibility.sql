-- Preserve Passport and provenance metadata for older clients that omit p_metadata.
begin;

create or replace function private.manage_campus_map_feature_with_metadata_impl(
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
  v_existing_metadata jsonb := '{}'::jsonb;
  v_safe_passport_metadata jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in is required.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm
  join public.profiles p on p.id=cm.user_id
  where cm.user_id=v_uid
    and cm.campus_role='admin'
    and cm.membership_status='active'
    and cm.verification_status='verified'
    and p.role='admin'
    and p.verification_status='verified'
  limit 1;

  if v_university_id is null then
    raise exception 'A verified campus administrator is required to manage map locations.';
  end if;

  if p_feature_id is not null then
    select f.metadata into v_existing_metadata
    from public.campus_map_features f
    where f.id=p_feature_id and f.university_id=v_university_id;
    if not found then
      raise exception 'This map location does not belong to your university.';
    end if;
  end if;

  if p_metadata is null then
    select coalesce(jsonb_object_agg(kv.key,kv.value),'{}'::jsonb)
      into v_safe_passport_metadata
    from jsonb_each(coalesce(v_existing_metadata,'{}'::jsonb)) as kv(key,value)
    where kv.key = any(array[
      'building_code','opening_hours','floor_count','facilities',
      'accessibility_features','accessibility_notes','building_feature_id',
      'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
    ]::text[]);
  else
    v_safe_passport_metadata := p_metadata;
  end if;

  v_id := private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,v_safe_passport_metadata
  );

  update public.campus_map_features
  set metadata = (
    coalesce(v_existing_metadata,'{}'::jsonb)
    - array[
      'building_code','opening_hours','floor_count','facilities',
      'accessibility_features','accessibility_notes','building_feature_id',
      'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
    ]::text[]
  ) || coalesce(v_safe_passport_metadata,'{}'::jsonb),
  updated_at = now()
  where id=v_id and university_id=v_university_id;

  if not found then
    raise exception 'The saved map location could not be reconciled with its Passport details.';
  end if;

  return v_id;
end;
$function$;

revoke all on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

commit;
