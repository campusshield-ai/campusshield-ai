-- A map feature cannot be linked to itself as its own parent building.
begin;

do $guard$
begin
  if exists (
    select 1 from public.campus_map_features
    where metadata->>'building_feature_id' = id::text
  ) then
    raise exception 'Existing CampusMap rows contain a self-referencing building parent; review them before applying this constraint.';
  end if;
end;
$guard$;

alter table public.campus_map_features
  drop constraint if exists campus_map_feature_parent_not_self;
alter table public.campus_map_features
  add constraint campus_map_feature_parent_not_self
  check (
    metadata->>'building_feature_id' is null
    or metadata->>'building_feature_id' <> id::text
  );

commit;
