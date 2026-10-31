# CampusMap — multi-university rollout

## Scope
CampusMap is a reusable, university-scoped interactive map inside CampusShield AI. The first implementation adds a MapLibre map surface, campus feature search/list, 2D and tilted 3D-style views, device-only location, and walking directions to a selected published location.

## Data model
- `campus_map_features` belongs to `campus_universities` through `university_id`.
- Public map reads expose only published points.
- Browser roles are read-only in this initial migration. Publishing/admin editing is intentionally withheld until the existing campus-admin authorization contract is reviewed and exercised in staging.
- No incident coordinates or private student data are exposed by this feature.

## First pilot
Babcock University is the first pilot. The current implementation uses an approximate campus-centre fallback only when the selected campus slug is `babcock-university`; it does not fabricate building pins or claim verified 3D building coverage. Verified locations must be added to the map table before they appear.

## Providers and attribution
- MapLibre GL JS for map rendering.
- OpenStreetMap raster tiles for the base map, with visible attribution.
- OSRM public demo routing endpoint for prototype walking routes. This is not a production SLA; replace with a contracted/operated routing service before broad rollout.
- Detailed satellite imagery, terrain and 3D building meshes require an appropriately licensed imagery/vector provider and verified building geometry. The 3D control currently provides a pitched view, not a claim of photogrammetric 3D.

## Staging acceptance gates
1. Apply the additive migration to CampusShield AI Staging only.
2. Seed a small set of verified Babcock test locations after checking coordinates against authoritative campus sources.
3. Confirm one campus can read only its own university_id points; test cross-campus query attempts.
4. Test student, staff, campus-admin, unverified and no-campus sessions.
5. Verify geolocation denial, offline/error states, mobile breakpoints and walking route fallback.
6. Add a separately reviewed campus-admin publishing RPC and management UI before asking universities to maintain their own maps.
7. Do not merge to production until staging browser tests and security review pass.
