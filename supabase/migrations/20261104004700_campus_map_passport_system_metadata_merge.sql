-- Preserve existing system/provenance metadata when campus admins update Passport details.
begin;

create function private.manage_campus_map_feature_with_metadata_impl(
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

  v_id := private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );

  -- NULL metadata means a legacy client is editing a location-only field:
  -- preserve every Passport and provenance field exactly as stored.
  if p_metadata is not null then
    update public.campus_map_features
    set metadata = (
      coalesce(v_existing_metadata,'{}'::jsonb)
      - array[
        'building_code','opening_hours','floor_count','facilities',
        'accessibility_features','accessibility_notes','building_feature_id',
        'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
      ]::text[]
    ) || p_metadata,
    updated_at = now()
    where id=v_id and university_id=v_university_id;
    if not found then
      raise exception 'The saved map location could not be reconciled with its Passport details.';
    end if;
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

drop function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
);

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
  select private.manage_campus_map_feature_with_metadata_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );
$wrapper$;

revoke all on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public,anon;
grant execute on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

commit;
