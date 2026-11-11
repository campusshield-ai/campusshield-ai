-- Cover CampusMap foreign keys with dedicated indexes for joins and parent-row maintenance.
CREATE INDEX IF NOT EXISTS campus_map_buildings_campus_id_idx
  ON public.campus_map_buildings (campus_id);

CREATE INDEX IF NOT EXISTS campus_map_buildings_verified_by_idx
  ON public.campus_map_buildings (verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_boundary_verified_by_idx
  ON public.campus_map_campuses (boundary_verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_center_verified_by_idx
  ON public.campus_map_campuses (center_verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_model_verified_by_idx
  ON public.campus_map_campuses (model_verified_by);
