import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const js = read('campus-map.js');
const mapConfig = read('campus-map-config.js');
const geometrySource = read('campus-map-geometry.js');
const geometryContext = {};
runInNewContext(geometrySource, geometryContext);
const geometry = geometryContext.CampusMapGeometry;
const css = read('campus-map.css');
const sql = read('supabase/migrations/20261031115759_campus_map_verified_locations_and_emergency_layers.sql');
const policySql = read('supabase/migrations/20261031115831_campus_map_public_read_policy_split.sql');
const finalPolicySql = read('supabase/migrations/20261031120234_campus_map_single_read_policy_and_audit_index.sql');
const babcockSeedSql = read('supabase/migrations/20261031130909_seed_babcock_main_campus_osm_candidates.sql');
const docs = read('docs/CAMPUSMAP_ROLLOUT.md');
const campusProfilesSql = read('supabase/migrations/20261031143000_campus_map_university_profiles_and_centres.sql');
const campusProfileGrantSql = read('supabase/migrations/20261031144500_grant_verified_campus_map_profile_rpc.sql');
const campusModelSql = read('supabase/migrations/20261031150500_campus_map_private_glb_model_submissions.sql');
const campusBuildingsSql = read('supabase/migrations/20261031142127_campus_map_building_footprint_import_pipeline.sql');
const campusBuildingsHardeningSql = read('supabase/migrations/20261031142749_harden_campus_building_geometry_review.sql');
const campusBuildingsNullGuardSql = read('supabase/migrations/20261031142958_guard_empty_building_import_payload.sql');

assert.match(html, /data-page="campus-map"/, 'CampusMap navigation entry is present');
assert.match(html, /id="page-campus-map"/, 'CampusMap page container is present');
const campusMapRootId = html.match(/<section class="page" id="([^"]+)" aria-labelledby="campus-map-title">/)?.[1];
assert.ok(campusMapRootId, 'CampusMap page root can be identified');
assert.ok(js.includes(`document.getElementById('${campusMapRootId}')`), 'CampusMap module binds to the actual HTML page root');
assert.match(html, /id="campus-map-canvas"/, 'Interactive map canvas is present');
assert.match(html, /id="campus-map-2d"[\s\S]*id="campus-map-satellite"[\s\S]*id="campus-map-3d"/, '2D, satellite and 3D map modes are all available');
assert.doesNotMatch(html, /campus-map-attribution/, 'Map does not render a duplicate manual attribution strip');
assert.match(html, /id="campus-map-center"/, 'Campus centre control is present');
assert.match(html, /id="campus-map-results" class="campus-map-search-results"/, 'Responsive search result container is present');
assert.match(html, /id="campus-map-scale-summary"/, 'Live map scale label is present');
assert.match(html, /id="campus-map-pick-pin"/, 'Administrators can place a pin directly on the map');
assert.match(html, /id="campus-map-use-gps"/, 'Administrators can capture a GPS candidate with device accuracy');
assert.match(html, /id="campus-map-preview-pin"/, 'Administrators can preview manually entered coordinates');
assert.match(html, /campus-map\.js/, 'CampusMap module is loaded');
assert.match(html, /maplibre-gl@4\.7\.1/, 'MapLibre is pinned to a known version');
assert.match(html, /report-use-location/, 'Incident form offers optional GPS attachment');
assert.match(js, /getMyCampusContext\(\)/, 'Map resolves the signed-in university context');
assert.match(js, /\.eq\('university_id', campus\.university_id\)/, 'Feature query is scoped to the current university');
assert.match(js, /manage_campus_map_feature/, 'Campus map manager uses the checked admin RPC');
assert.match(js, /campus_role/, 'Campus map manager checks the signed-in campus role');
assert.match(js, /from\('incidents'\)/, 'Staff incident overlay reads incident pins');
assert.match(js, /getCurrentPosition/, 'Device location requires browser geolocation permission');
assert.match(js, /map\.once\('load', fitCampus\)/, 'Campus camera waits for the MapLibre style when needed');
assert.match(js, /includes\('babcock'\)/, 'Babcock campus recognition tolerates variant university slugs');
assert.match(js, /campus-draft-points/, 'Pending coordinate pins are rendered in the admin-only draft layer');
assert.match(js, /applyAdminCoordinates\(/, 'Coordinate picking is shared by map and GPS inputs');
assert.match(js, /position\.coords\.accuracy/, 'GPS candidate reports device accuracy');
assert.match(js, /payload\.p_publish && !payload\.p_mark_verified/, 'Unverified locations cannot be published from the client');
assert.match(js, /needsCoordinateEvidence/, 'Community-mapped candidate pins require fresh exact-coordinate evidence');
assert.match(html, /Coordinate evidence source \(HTTPS\)/, 'Evidence field is explicitly for the exact pin');
assert.match(js, /maptiler\.com/, 'Optional terrain elevation source is supported');
assert.doesNotMatch(js, /Satellite imagery needs a domain-restricted MapTiler key/, 'Satellite imagery is not gated on a MapTiler key');
assert.match(js, /services\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/, 'Esri satellite imagery is available without a MapTiler key');
assert.match(js, /maxzoom: 16/, 'Esri imagery retains more detailed campus tiles while capping unsupported higher zooms');
assert.match(js, /attributionControl: \{ compact: true \}/, 'Native provider attribution uses the compact MapLibre control');
assert.match(js, /cluster: true/, 'Administrator-only draft pins are clustered at campus scale');
assert.match(js, /getClusterExpansionZoom/, 'Draft clusters can be expanded smoothly');
assert.match(js, /data-search-draft-id/, 'Verified campus admins can search their own draft locations');
assert.match(js, /isCampusAdmin && term/, 'Pending locations are excluded from non-admin search results');
assert.match(css, /campus-map-search-results/, 'Search suggestions are styled responsively');
assert.match(js, /ResizeObserver/, 'Map resizes when responsive containers change size');
assert.match(js, /prefers-reduced-motion: reduce/, 'Camera movement respects reduced-motion accessibility settings');
assert.match(js, /maxzoom: 14/, 'OpenMapTiles vector source is overzoomed from its generated max zoom');
assert.match(js, /campus-osm-3d-building-edges/, '3D building blocks have subtle outline detail');
assert.doesNotMatch(js, /campus-osm-3d-building-labels/, 'The non-existent named-building source layer is not requested');
assert.match(js, /tiles\.openfreemap\.org\/planet/, 'OpenFreeMap vector tiles provide OSM building geometry');
assert.match(js, /return 'https:\/\/tiles\.openfreemap\.org\/styles\/liberty';/, 'OpenFreeMap Liberty provides the primary vector basemap');
assert.match(js, /const SATELLITE_ROAD_LAYER_IDS/, 'Custom mapped road overlays are grouped for satellite and 3D modes');
assert.match(js, /SATELLITE_ROAD_LAYER_IDS\.forEach\(id => setLayerVisibility\(id, satelliteOn\)\)/, 'Custom road overlays do not duplicate the vector street basemap in 2D');
assert.match(js, /Noto Sans Regular/, 'Map labels use OpenFreeMap supported Noto Sans glyphs');
assert.match(js, /Noto Sans Bold/, 'Cluster count labels use OpenFreeMap supported bold glyphs');
assert.match(js, /'source-layer': 'transportation'/, 'Road styling uses mapped OpenMapTiles transportation geometry');
assert.match(js, /campus-roads-main-casing/, 'Primary campus roads have a high-contrast casing');
assert.match(js, /campus-roads-secondary/, 'Secondary roads have a distinct thinner style');
assert.match(js, /campus-roads-local/, 'Mapped local and access roads are visible at campus zoom');
assert.match(js, /campus-footpaths/, 'Mapped paths are visually distinct and dashed');
assert.match(js, /campus-road-labels/, 'Mapped road names follow road geometry');
assert.match(js, /Noto Sans Regular/, 'Road labels use the configured supported glyph font');
assert.match(js, /motorway_link/, 'Mapped primary access ramps are styled with primary roads');
assert.match(js, /secondary_link/, 'Mapped secondary access ramps are styled with secondary roads');
assert.match(js, /'source-layer': 'transportation_name'/, 'Road labels use the mapped transportation-name layer');
assert.match(js, /never synthesize connecting lines/, 'The road renderer does not invent roads in unmapped areas');
assert.match(js, /campus-osm-3d-buildings/, '3D mode renders building footprints as extrusions');
assert.match(js, /render_height/, 'Building extrusion height uses OSM-derived height attributes');
assert.match(js, /campus-osm-3d-poi-labels/, 'Satellite and 3D modes include OSM place labels');
assert.match(js, /applyMapMode\('satellite'\)/, 'SAT mode has an independent switch');
assert.match(css, /@media\(max-width:600px\)/, 'Map layout includes mobile responsive rules');
assert.match(css, /campus-map-pin-tools/, 'Precision pin controls are styled');
assert.match(css, /campus-map-legend/, 'Published and draft markers have a visible legend');
assert.match(css, /campus-map-controls\{position:absolute[\s\S]*flex-direction:column/, 'Map style controls are vertically arranged like the reference');
assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'Map feature table enables RLS');
assert.match(sql, /FORCE ROW LEVEL SECURITY/, 'Map feature table forces RLS');
assert.match(sql, /REVOKE ALL ON public\.campus_map_features FROM anon,authenticated/, 'Browser roles cannot mutate map features');
assert.match(sql, /GRANT SELECT ON public\.campus_map_features TO anon,authenticated/, 'Browser roles receive read-only access');
assert.match(sql, /private\.manage_campus_map_feature_impl/, 'Map writes use a private checked implementation');
assert.match(sql, /Iperu Campus/, 'Babcock Iperu campus is seeded separately');
assert.match(policySql, /FOR SELECT TO anon, authenticated/, 'Anonymous users have a published-only policy');
assert.match(policySql, /campus_map_features_read_admin_drafts/, 'Verified campus admins can read their drafts');
assert.match(policySql, /current_user_has_verified_campus_access/, 'Draft reads require verified campus access');
assert.match(finalPolicySql, /SECURITY INVOKER/, 'Draft access helper runs with invoker permissions');
assert.match(finalPolicySql, /IF \(SELECT auth\.uid\(\)\) IS NULL/, 'Anonymous requests do not enter private membership helpers');
assert.match(finalPolicySql, /can_read_campus_map_drafts\(university_id\)/, 'Single read policy gates unpublished drafts');
assert.match(finalPolicySql, /campus_map_features_verified_by_idx/, 'Verification audit foreign key is indexed');
assert.match(docs, /Campus Map Manager/, 'Documentation covers the admin manager');
assert.match(babcockSeedSql, /'BBS Babcock Business School'/, 'Babcock candidate seed includes the business school');
assert.match(babcockSeedSql, /'Queen Esther Hall'/, 'Babcock candidate seed includes named residences');
assert.match(babcockSeedSql, /'candidate_unverified'/, 'OSM candidate locations remain explicitly unverified');
assert.match(babcockSeedSql, /false,\s*jsonb_build_object/, 'OSM candidate locations are inserted unpublished');
assert.match(docs, /22 Babcock location entries/, 'Documentation lists the expanded Babcock directory');
assert.match(docs, /not necessarily doorways or building footprints/, 'Community-mapped point coordinates are not treated as exact building entrances');
assert.match(campusProfilesSql, /CREATE TABLE IF NOT EXISTS public\.campus_map_campuses/, 'Multi-university campus profile table is created');
assert.match(campusProfilesSql, /WHERE u\.is_active = true/, 'Campus profiles are provisioned for every active university');
assert.match(campusProfilesSql, /center_status IN \('missing','candidate','official_locator','verified'\)/, 'Campus centre provenance states are constrained');
assert.match(campusProfilesSql, /boundary_geojson->>'type' IN \('Polygon','MultiPolygon'\)/, 'Campus boundaries accept only polygon geometry');
assert.match(campusProfilesSql, /ENABLE ROW LEVEL SECURITY[\s\S]*FORCE ROW LEVEL SECURITY/, 'Campus profile table forces row-level security');
assert.match(campusProfileGrantSql, /GRANT EXECUTE ON FUNCTION private\.manage_campus_map_campus_impl/, 'Verified campus admin wrapper can execute its checked private implementation');
assert.match(campusModelSql, /'campus-map-models',[\s\S]*false,[\s\S]*26214400/, '3D model files use a private 25 MB bucket');
assert.match(campusModelSql, /campus_map_model_admin_upload/, 'Only a verified campus administrator can upload model files');
assert.match(campusModelSql, /model_status = 'pending_review'/, 'Uploaded GLB files remain pending review');
assert.match(html, /id="campus-map-profile-boundary"/, 'Campus administrators can add a GeoJSON campus boundary');
assert.match(html, /id="campus-map-profile-model-file"/, 'Campus administrators can submit a real GLB building model');
assert.match(js, /campus_map_campuses/, 'Map loads the university-scoped campus profile');
assert.match(js, /stateOverviewCentre/, 'Universities without a campus centre use a labelled state-level fallback');
assert.match(js, /submit_campus_3d_model/, '3D model uploads pass through the checked RPC');
assert.match(js, /file\.size > 25 \* 1024 \* 1024/, 'GLB upload is capped at 25 MB in the browser');
assert.match(campusBuildingsSql, /CREATE TABLE IF NOT EXISTS public\.campus_map_buildings/, 'University-scoped building footprint review table is created');
assert.match(campusBuildingsSql, /ENABLE ROW LEVEL SECURITY[\s\S]*FORCE ROW LEVEL SECURITY/, 'Building footprint records enforce RLS');
assert.match(campusBuildingsSql, /private\.import_campus_map_building_candidates_impl/, 'Building imports use a private checked implementation');
assert.match(campusBuildingsSql, /campus_role='admin'[\s\S]*verification_status='verified'/, 'Only verified campus administrators can import building candidates');
assert.match(campusBuildingsSql, /ODbL-1\.0/, 'OpenStreetMap building candidates retain the ODbL licence attribution');
assert.match(campusBuildingsSql, /'pending',false/, 'Imported building candidates remain pending and unpublished');
assert.match(campusBuildingsSql, /private\.review_campus_map_building_impl/, 'Building review uses a checked university-scoped RPC');
assert.match(campusBuildingsHardeningSql, /polygon ring that is not closed/, 'Building import rejects unclosed polygon rings');
assert.match(campusBuildingsHardeningSql, /numeric longitude\/latitude pair/, 'Building import validates each coordinate pair');
assert.match(campusBuildingsHardeningSql, /building_coverage_status=CASE/, 'A verified building only advances campus coverage to partial');
assert.match(html, /id="campus-map-building-discover"/, 'Verified campus administrators can discover building footprints');
assert.match(html, /id="campus-map-building-review"/, 'Building candidate review panel is present');
assert.match(js, /import_campus_map_building_candidates/, 'Building import calls the checked Staging RPC');
assert.match(js, /review_campus_map_building/, 'Building review calls the checked Staging RPC');
assert.match(js, /function buildingFeatureCollection/, 'Building outlines are converted to GeoJSON for the map');
assert.match(js, /height_method/, 'Building height provenance is retained for the 3D view');
assert.match(js, /Math\.max\(baseRenderHeight, minHeight \+ 1\.5\)/, 'Rendered building tops remain above any mapped minimum height');
assert.match(js, /\['no','false','0'\]/, 'Explicit OSM building=no records are excluded');
assert.match(js, /\['get', 'roof_colour'\]/, 'Available roof colours inform 2D building footprints');
assert.match(js, /updateCampusBoundarySource/, 'Saved campus boundaries are drawn on the map');
assert.match(js, /validateCampusBoundaryGeometry/, 'Campus boundary polygons are validated before saving');
assert.match(js, /const preferredLayer = hasCurated \? 'campus-curated-building-extrusions' : 'campus-osm-3d-buildings'/, 'Map prefers university-curated footprints and falls back to global OSM buildings');
assert.match(js, /queryRenderedFeatures\(\{ layers: \[preferredLayer\] \}\)/, 'Map coverage indicator counts the active building source');

assert.ok(geometry && typeof geometry.osmWayToBuildingCandidate === 'function', 'CampusMap geometry helpers are exported');

const irregularWay = {
  id: 123456789,
  tags: {
    building: 'yes',
    name: 'Test Hall',
    height: '12 ft',
    min_height: '3 m',
    'building:levels': '4',
  },
  // Extra vertices on the left edge deliberately bias a simple vertex-average.
  // The area-weighted centroid of this rectangle is still exactly (2, 1).
  geometry: [
    { lon: 0, lat: 0 },
    { lon: 4, lat: 0 },
    { lon: 4, lat: 2 },
    { lon: 0, lat: 2 },
    { lon: 0, lat: 1 },
    { lon: 0, lat: 0 },
  ],
};
const irregularCandidate = geometry.osmWayToBuildingCandidate(irregularWay);
assert.ok(irregularCandidate, 'valid OSM building way converts to a candidate');
assert.ok(Math.abs(irregularCandidate.center_longitude - 2) < 1e-9, 'area centroid longitude is not biased by vertex density');
assert.ok(Math.abs(irregularCandidate.center_latitude - 1) < 1e-9, 'area centroid latitude is not biased by vertex density');
assert.ok(Math.abs(irregularCandidate.height_m - 3.6576) < 1e-9, 'feet are converted to metres');
assert.equal(irregularCandidate.min_height_m, 3, 'minimum height tags are parsed');
assert.equal(irregularCandidate.levels, 4, 'integer building levels are retained');
assert.equal(irregularCandidate.height_method, 'tagged', 'tagged height provenance is preserved');
assert.equal(irregularCandidate.verification_status, undefined, 'OSM conversion does not fabricate review status');

const unclosedWay = {
  ...irregularWay,
  geometry: irregularWay.geometry.slice(0, -1),
};
const unclosedCandidate = geometry.osmWayToBuildingCandidate(unclosedWay);
assert.ok(unclosedCandidate, 'valid unclosed Overpass ring is safely closed');
const firstPoint = unclosedCandidate.geometry_geojson.coordinates[0][0];
const finalPoint = unclosedCandidate.geometry_geojson.coordinates[0].at(-1);
assert.equal(firstPoint[0], finalPoint[0], 'candidate polygon ring closes longitude');
assert.equal(firstPoint[1], finalPoint[1], 'candidate polygon ring closes latitude');

assert.equal(geometry.parseOsmLevels('4.5'), null, 'fractional floor counts are not truncated');
assert.equal(geometry.osmWayToBuildingCandidate({
  ...irregularWay, tags: { building: 'no' },
}), null, 'explicit building=no ways are rejected');
assert.equal(geometry.osmWayToBuildingCandidate({
  ...irregularWay,
  geometry: irregularWay.geometry.map((point, index) => index === 2 ? { ...point, lat: 95 } : point),
}), null, 'an invalid coordinate rejects the whole outline instead of silently corrupting it');
assert.equal(geometry.osmWayToBuildingCandidate({
  ...irregularWay,
  tags: { ...irregularWay.tags, height: '3 m', min_height: '5 m' },
}), null, 'inconsistent height and min-height tags are rejected');
assert.equal(geometry.osmWayToBuildingCandidate({
  ...irregularWay,
  geometry: [
    { lon: 1, lat: 1 }, { lon: 2, lat: 2 }, { lon: 3, lat: 3 }, { lon: 1, lat: 1 },
  ],
}), null, 'zero-area geometry is rejected');

console.log('CampusMap static smoke checks passed.');
