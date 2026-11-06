import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const js = read('campus-map.js');
const discoverySource = read('campus-map-discovery.js');
const iconSource = read('campus-map-icons.js');
const navigationSource = read('campus-map-navigation.js');
const navigationContext = { window: {} };
runInNewContext(navigationSource, navigationContext);
const navigation = navigationContext.window.CampusMapNavigation;
const mapConfig = read('campus-map-config.js');
const mapLoader = read('campus-map-loader.js');
const geometrySource = read('campus-map-geometry.js');
const geometryContext = {};
runInNewContext(geometrySource, geometryContext);
const geometry = geometryContext.CampusMapGeometry;
const css = read('campus-map.css');
const iconContext = { window: {} };
runInNewContext(iconSource, iconContext);
const campusMapIcons = iconContext.window.CampusMapIcons;
assert.ok(campusMapIcons, 'CampusMap exposes its original SVG symbol library');

assert.ok(navigation, 'CampusMap exposes a pure route-target resolver for safe direction selection');
const routeBuilding = {
  id: 'building-1', name: 'Library', feature_type: 'building',
  longitude: 3.7, latitude: 6.8, verification_status: 'verified'
};
const sideEntrance = {
  id: 'side-entrance', name: 'Side Entrance', feature_type: 'entrance',
  longitude: 3.701, latitude: 6.801, verification_status: 'verified',
  metadata: { building_feature_id: 'building-1', entry_type: 'secondary' }
};
const mainEntrance = {
  id: 'main-entrance', name: 'Main Gate', feature_type: 'entrance',
  longitude: 3.702, latitude: 6.802, verification_status: 'verified',
  metadata: { building_feature_id: 'building-1', entry_type: 'main' }
};
const accessibleEntrance = {
  id: 'accessible-entrance', name: 'Accessible Entry', feature_type: 'accessible_entry',
  longitude: 3.703, latitude: 6.803, verification_status: 'verified',
  metadata: { building_feature_id: 'building-1', entry_type: 'accessible' }
};
assert.equal(navigation.resolveRouteTarget(routeBuilding, [sideEntrance, accessibleEntrance, mainEntrance], false), mainEntrance,
  'Normal walking directions prefer the linked main entrance over other entrances');
assert.equal(navigation.resolveRouteTarget(routeBuilding, [sideEntrance, accessibleEntrance], false), sideEntrance,
  'Normal walking directions use a published linked entrance when no main entrance is recorded');
assert.equal(navigation.resolveRouteTarget(routeBuilding, [sideEntrance, accessibleEntrance, mainEntrance], true), accessibleEntrance,
  'Accessible directions resolve only to the linked published accessible entrance');
assert.equal(navigation.resolveRouteTarget(routeBuilding, [sideEntrance, mainEntrance], true), null,
  'Accessible directions never silently fall back to an ordinary entrance or building marker');
assert.equal(navigation.resolveRouteTarget(routeBuilding, [], false), routeBuilding,
  'A published campus location marker is used only when no separate entrance is recorded');
assert.equal(navigation.describeRouteTarget(routeBuilding, mainEntrance), 'Verified main entrance: Main Gate',
  'Passport route explanation names the verified main entrance');
assert.equal(navigation.describeRouteTarget(routeBuilding, accessibleEntrance), 'Verified accessible entrance: Accessible Entry',
  'Passport route explanation names the verified accessible entrance');
assert.equal(navigation.describeRouteTarget(routeBuilding, routeBuilding),
  'Campus location marker: Library (no separate mapped entrance is recorded)',
  'Passport labels the building-marker fallback without implying an entrance exists');
assert.equal(navigation.resolveRouteTarget(sideEntrance, [sideEntrance], true), null,
  'Accessible routing rejects an ordinary selected entrance');
assert.equal(navigation.resolveRouteTarget(accessibleEntrance, [accessibleEntrance], true), accessibleEntrance,
  'An explicitly selected accessible entrance remains a valid accessible route target');
assert.equal(navigation.hasValidCoordinates({ longitude: '3.7', latitude: '6.8' }), true,
  'Valid numeric coordinate strings are accepted');
assert.equal(navigation.hasValidCoordinates({ longitude: '', latitude: '6.8' }), false,
  'Empty coordinate strings are rejected instead of being coerced to zero');
assert.equal(navigation.hasValidCoordinates({ longitude: 181, latitude: 6.8 }), false,
  'Longitude outside the WGS84 range is rejected');
assert.equal(navigation.hasValidCoordinates({ longitude: 3.7, latitude: null }), false,
  'Missing coordinate values are rejected');
assert.equal(navigation.resolveRouteTarget(routeBuilding, [{
  ...mainEntrance, longitude: 181
}], false), routeBuilding,
  'An invalid entrance pin is ignored and the valid selected campus marker remains the fallback');
assert.equal(navigation.resolveRouteTarget({
  ...routeBuilding, latitude: 91
}, [mainEntrance], false), null,
  'An invalid selected location cannot become a route origin or destination');

assert.match(js, /import '\.\/campus-map-navigation\.js'/, 'CampusMap loads its explicit navigation-target resolver');
assert.match(js, /navigation\?\.resolveRouteTarget\(item, features, false\)/,
  'The Campus Passport displays the resolved standard route destination');
assert.match(js, /navigation\?\.resolveRouteTarget\(item, features, true\)/,
  'The Campus Passport displays the resolved accessible route destination');
assert.match(js, /hasValidCoordinates\(target\)/,
  'Route requests validate destination coordinates before calling the foot router');
assert.match(js, /Destination: ' \+ routeTargetDescription/,
  'Successful route status tells users which published destination was used');
const expectedCampusIconTypes = [
  'security','medical','library','hostel','cafeteria','lecture_hall','building',
  'gate','entrance','parking','sports','assembly_point','accessible_entry',
  'emergency_point','location'
];
assert.deepEqual(Array.from(campusMapIcons.types), expectedCampusIconTypes, 'SVG symbol library covers all existing campus feature types and a fallback');
for (const type of expectedCampusIconTypes) {
  const svg = campusMapIcons.svg(type);
  assert.match(svg, /<svg[^>]+viewBox="0 0 32 32"/, type + ' icon is a scalable SVG');
  assert.match(svg, /<circle[^>]+fill="#[0-9a-f]{6}"/i, type + ' icon has a category colour and white outline');
  assert.doesNotMatch(svg, /<script|<foreignObject|\shref=/i, type + ' icon contains no active or external embedded content');
}
assert.match(js, /import '\.\/campus-map-icons\.js'/, 'Map module loads the local SVG symbol library');
assert.match(js, /id: 'campus-feature-icons'/, 'Map renders category-specific SVG symbols as a separate visual layer');
assert.match(js, /await window\.CampusMapIcons\.addToMap\(map\)/, 'SVG symbols are registered locally before the map icon layer is created');
assert.match(js, /setLayerVisibility\('campus-feature-icons', preferences\.locations\)/, 'The campus locations layer toggle controls SVG markers too');
assert.match(js, /map\.on\('click', 'campus-feature-icons'/, 'SVG marker clicks open the matching Campus Passport');
assert.match(js, /function iconFor\(type\)\s*\{\s*return window\.CampusMapIcons\?\.svg\(type\)/, 'The location list uses the same SVG symbols as the map');
assert.match(css, /campus-map-feature-icon svg/, 'SVG location symbols have responsive list styling');
const coverageCss = read('campus-dashboard-insights.css');
const passportCss = read('campus-map-passport.css');
const passportSql = read('supabase/migrations/20261104004500_campus_map_passports_and_verified_entrance_details.sql');
const passportMergeSql = read('supabase/migrations/20261104004700_campus_map_passport_system_metadata_merge.sql');
const passportCompatSql = read('supabase/migrations/20261104005000_campus_map_passport_metadata_null_compatibility.sql');
const passportParentGuardSql = read('supabase/migrations/20261104005500_campus_map_building_parent_no_self_reference.sql');
const sql = read('supabase/migrations/20261031115759_campus_map_verified_locations_and_emergency_layers.sql');
const policySql = read('supabase/migrations/20261031115831_campus_map_public_read_policy_split.sql');
const finalPolicySql = read('supabase/migrations/20261031120234_campus_map_single_read_policy_and_audit_index.sql');
const babcockSeedSql = read('supabase/migrations/20261031130909_seed_babcock_main_campus_osm_candidates.sql');
const docs = read('docs/CAMPUSMAP_ROLLOUT.md');
const campusProfilesSql = read('supabase/migrations/20261031134221_campus_map_university_profiles_and_centres.sql');
const campusProfileGrantSql = read('supabase/migrations/20261031134823_grant_verified_campus_map_profile_rpc.sql');
const campusModelSql = read('supabase/migrations/20261031135144_campus_map_private_glb_model_submissions.sql');
const campusBuildingsSql = read('supabase/migrations/20261031142127_campus_map_building_footprint_import_pipeline.sql');
const campusBuildingsHardeningSql = read('supabase/migrations/20261031142749_harden_campus_building_geometry_review.sql');
const campusBuildingsNullGuardSql = read('supabase/migrations/20261031142958_guard_empty_building_import_payload.sql');
const campusBuildingsCentreGuardSql = read('supabase/migrations/20261031182424_campus_building_import_verified_centre_guard.sql');
const campusMapForeignKeyIndexesSql = read('supabase/migrations/20261031182609_campus_map_admin_fk_indexes.sql');
const babcockDirectorySql = read('supabase/migrations/20261104010500_babcock_main_campus_official_name_candidates.sql');
const babcockEvidenceCleanupSql = read('supabase/migrations/20261104011000_babcock_candidate_point_evidence_cleanup.sql');
const babcockCoordinateStatusSql = read('supabase/migrations/20261104011500_babcock_coordinate_candidate_status_normalization.sql');

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
assert.match(html, /campus-map-geometry\.js/, 'OSM footprint geometry helpers load before CampusMap');
assert.match(mapLoader, /import\('\.\/campus-map\.js'\)/, 'CampusMap module is loaded after the MapLibre ESM bootstrap');
assert.match(js, /window\.CampusMapGeometry\?\.osmWayToBuildingCandidate/, 'OSM building imports use the extracted geometry helper');
assert.ok(html.indexOf('campus-map-geometry.js') < html.indexOf('campus-map-loader.js'), 'geometry helper loads before the MapLibre module loader');

assert.match(html, /maplibre-gl@6\.16\.0\/dist\/maplibre-gl\.css/, 'MapLibre CSS is pinned to v6.16.0');
assert.match(html, /type="module" src="\.\/campus-map-loader\.js"/, 'MapLibre v6 is loaded through an ordered ES-module bootstrap');
assert.match(mapLoader, /maplibre-gl@6\.16\.0\/dist\/maplibre-gl\.mjs/, 'MapLibre v6 imports the ES-module bundle');
assert.match(mapLoader, /window\.maplibregl = maplibregl;[\s\S]*await import\('\.\/campus-map\.js'\)/, 'CampusMap imports only after the MapLibre namespace is ready');
assert.match(mapConfig, /baseStyleUrl/, 'The vector style URL is configurable');
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
assert.match(js, /const DEFAULT_BASE_STYLE_URL = 'https:\/\/tiles\.openfreemap\.org\/styles\/liberty'/, 'OpenFreeMap Liberty remains the default vector basemap');
assert.match(js, /url\.protocol === 'https:'/, 'Configured basemap styles must use HTTPS');
assert.match(js, /return DEFAULT_BASE_STYLE_URL;/, 'Invalid or absent basemap configuration falls back safely');
assert.match(js, /const SATELLITE_ROAD_LAYER_IDS/, 'Custom mapped road overlays are grouped for satellite and 3D modes');
assert.match(js, /baseStyleLayerIds/, 'Provider base layers are captured before app overlays');
assert.match(js, /setBaseStyleVisibility\(!satelliteOn\)/, 'Satellite and 3D modes hide base-style layers without hiding campus overlays');
assert.match(js, /fill-extrusion-rounded-corner-distance/, 'Rounded 3D building edges use the supported MapLibre extrusion property');
assert.match(js, /SATELLITE_ROAD_LAYER_IDS\.forEach\(id => setLayerVisibility\(id, satelliteOn\)\)/, 'Custom road overlays do not duplicate the vector street basemap in 2D');
const mapModeStart = js.indexOf('function applyMapMode(');
const mapModeEnd = js.indexOf('function ', mapModeStart + 10);
const mapModeBody = mapModeStart >= 0 && mapModeEnd > mapModeStart
  ? js.slice(mapModeStart, mapModeEnd)
  : '';
assert.ok(mapModeBody, 'Map mode switch implementation is present');
assert.ok(mapModeBody.includes("const satelliteOn = mode !== '2d'"), 'Only satellite and 3D modes enable imagery layers');
assert.ok(mapModeBody.includes("setLayerVisibility('campus-esri-imagery-layer', satelliteOn)"), '2D hides imagery and SAT/3D show imagery');
assert.ok(mapModeBody.includes("const buildingsOn = mode === '3d'"), 'Building extrusions are exclusive to 3D mode');
assert.ok(mapModeBody.includes("setLayerVisibility('campus-osm-3d-buildings', buildingsOn && !hasCuratedFootprints)"), '3D falls back to global OSM building shapes when curated campus footprints are unavailable');
assert.ok(mapModeBody.includes("setLayerVisibility('campus-curated-building-extrusions', buildingsOn && hasCuratedFootprints)"), '3D uses reviewed campus-specific footprints when available');
assert.ok(mapModeBody.includes("? { pitch: 54, bearing: -16 }") && mapModeBody.includes(": { pitch: 0, bearing: 0 };"), '3D pitches the camera and 2D/SAT restore a top-down camera');
assert.ok(mapModeBody.includes("button?.setAttribute('aria-pressed', mode === key ? 'true' : 'false')"), 'Map mode controls expose their active state accessibly');

assert.match(js, /Noto Sans Regular/, 'Map labels use OpenFreeMap supported Noto Sans glyphs');
assert.match(js, /Noto Sans Bold/, 'Cluster count labels use OpenFreeMap supported bold glyphs');
assert.match(js, /'source-layer': 'transportation'/, 'Road styling uses mapped OpenMapTiles transportation geometry');
assert.match(js, /campus-roads-main-casing/, 'Primary campus roads have a defined casing');
assert.match(js, /'line-opacity': 0\.72/, 'Satellite road casings are softened to avoid overwhelming imagery');
assert.match(js, /campus-roads-secondary/, 'Secondary roads have a distinct thinner style');
assert.match(js, /campus-roads-local/, 'Mapped local and access roads are visible at campus zoom');
assert.match(js, /campus-footpaths/, 'Mapped paths are visually distinct and dashed');
assert.match(js, /campus-road-labels/, 'Mapped road names follow road geometry');
assert.match(js, /Noto Sans Regular/, 'Road labels use the configured supported glyph font');
assert.match(js, /motorway_link/, 'Mapped primary access ramps are styled with primary roads');
assert.match(js, /secondary_link/, 'Mapped secondary access ramps are styled with secondary roads');
assert.match(js, /'source-layer': 'transportation_name'/, 'Road labels use the mapped transportation-name layer');
assert.match(js, /Never synthesize unmapped connecting lines/, 'The road renderer does not invent roads in unmapped areas');
assert.match(js, /campus-osm-3d-buildings/, '3D mode renders building footprints as extrusions');
assert.match(js, /render_height/, 'Building extrusion height uses OSM-derived height attributes');
assert.match(js, /campus-osm-3d-poi-labels/, 'Satellite and 3D modes include OSM place labels');
assert.match(js, /not campus-verified/, 'Global OpenStreetMap building shapes are distinguished from university-verified campus data');
assert.match(js, /official campus locator only \(not a surveyed centre\)/, 'An official campus locator is not presented as a surveyed campus centre');
assert.match(js, /Close-up view/, 'Map zoom level is not described as proof of building-level data accuracy');
assert.match(js, /university-approved/, 'Global OSM place labels are explicitly marked as unverified context');
assert.match(js, /applyMapMode\('satellite'\)/, 'SAT mode has an independent switch');
assert.match(css, /@media\(max-width:600px\)/, 'Map layout includes mobile responsive rules');
assert.match(css, /campus-map-pin-tools/, 'Precision pin controls are styled');
assert.match(css, /campus-map-legend/, 'Published and draft markers have a visible legend');
assert.match(css, /campus-map-legend-context/, 'Global OSM context has its own legend style');
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
assert.match(js, /profile\.center_status !== 'verified'/, 'Browser refuses building discovery from an unverified campus centre');
assert.match(js, /updateBuildingDiscoveryControl\(\)/, 'Building discovery button follows verified-centre readiness');
assert.match(html, /id="campus-map-building-discover" disabled/, 'Building discovery starts disabled until the saved centre is verified');
assert.match(campusBuildingsCentreGuardSql, /RENAME TO import_campus_map_building_candidates_impl_unverified_centre_legacy/, 'Existing import implementation is wrapped with a stricter centre-verification guard');
assert.match(campusBuildingsCentreGuardSql, /center_status\s*=\s*'verified'/, 'Database refuses building imports without a verified campus centre');
assert.match(campusBuildingsCentreGuardSql, /campus_role\s*=\s*'admin'[\s\S]*p\.verification_status\s*=\s*'verified'/, 'Centre readiness is checked only after verified campus-admin membership is confirmed');
assert.match(campusMapForeignKeyIndexesSql, /campus_map_buildings_campus_id_idx/, 'Building campus foreign key has a dedicated index');
assert.match(campusMapForeignKeyIndexesSql, /campus_map_buildings_verified_by_idx/, 'Building verifier foreign key has a dedicated index');
assert.match(campusMapForeignKeyIndexesSql, /campus_map_campuses_boundary_verified_by_idx/, 'Boundary verifier foreign key has a dedicated index');
assert.match(campusMapForeignKeyIndexesSql, /campus_map_campuses_center_verified_by_idx/, 'Centre verifier foreign key has a dedicated index');
assert.match(campusMapForeignKeyIndexesSql, /campus_map_campuses_model_verified_by_idx/, 'Model verifier foreign key has a dedicated index');
assert.match(campusBuildingsCentreGuardSql, /verified campus-centre point/, 'Database reports why an unverified centre cannot be used');
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

const discoveryContext = { window: {} };
runInNewContext(discoverySource, discoveryContext);
const discovery = discoveryContext.window.CampusMapDiscovery;
assert.ok(discovery, 'CampusMap exposes pure facility discovery helpers');
const discoveryTypes = Array.from(discovery.featureTypes, item => item.type);
assert.deepEqual(discoveryTypes, [
  'building','lecture_hall','hostel','library','cafeteria','medical','security','gate',
  'parking','sports','facility','assembly_point','entrance','accessible_entry','emergency_point'
], 'Facility type filters use the supported CampusMap admin categories');
const discoveryFixtures = [
  { id: 'lib', name: 'Learning Resource Centre', feature_type: 'library', description: 'Quiet study space', metadata: { facilities: ['Wi-Fi', 'group rooms'] } },
  { id: 'clinic', name: 'Campus Health Unit', feature_type: 'medical', description: 'First aid support', metadata: { opening_hours: 'Weekdays' } },
  { id: 'hostel', name: 'West Residence', feature_type: 'hostel', metadata: {} },
  { id: 'security', name: 'Main Security Post', feature_type: 'security', metadata: {} },
  { id: 'access', name: 'Library step-free entrance', feature_type: 'building', metadata: { accessibility_features: ['ramp','step_free_entry'] } },
  { id: 'cafe', name: 'Student Canteen', feature_type: 'cafeteria', metadata: {} }
];
assert.equal(discovery.matchesCategory(discoveryFixtures[0], 'academic'), true, 'Academic filter includes a library');
assert.equal(discovery.matchesCategory(discoveryFixtures[2], 'residential'), true, 'Residential filter includes a hostel');
assert.equal(discovery.matchesCategory(discoveryFixtures[5], 'services'), true, 'Services filter includes a cafeteria');
assert.equal(discovery.matchesCategory(discoveryFixtures[4], 'access'), true, 'Access filter includes a building with recorded accessibility attributes');
assert.equal(discovery.matchesCategory(discoveryFixtures[1], 'emergency'), true, 'Emergency filter preserves medical locations');
assert.equal(discovery.matchesType(discoveryFixtures[0], 'library'), true, 'Exact type filter selects libraries only');
assert.equal(discovery.matchesType(discoveryFixtures[0], 'medical'), false, 'Exact type filter excludes a different facility type');
assert.equal(discovery.matchesSearch(discoveryFixtures[1], 'clinic'), true, 'Clinic search alias finds medical locations');
assert.equal(discovery.matchesSearch(discoveryFixtures[5], 'canteen'), true, 'Canteen search alias finds cafeterias');
assert.equal(discovery.matchesSearch(discoveryFixtures[0], 'wifi group rooms'), true, 'Multi-word searches include Passport facility metadata');
assert.equal(discovery.matchesSearch(discoveryFixtures[0], 'quiet research centre'), true, 'Search matches descriptions and facility type synonyms');
assert.equal(discovery.matchesSearch(discoveryFixtures[0], 'sports'), false, 'Search excludes unrelated location categories');
assert.equal(discovery.normalize('École CAFÉ'), 'ecole cafe', 'Search normalisation handles accents and letter case');
const academicCounts = discovery.getTypeCounts(discoveryFixtures, 'academic');
assert.deepEqual(Array.from(academicCounts, item => [item.type, item.label, item.count]), [
  ['building','Buildings',1], ['library','Libraries',1]
], 'Type chips derive counts from the selected broad filter and current campus records');
assert.equal(discovery.getTypeCounts(discoveryFixtures, 'all').reduce((sum, item) => sum + item.count, 0), discoveryFixtures.length, 'Published facility type counts cover the supplied current-campus records');

assert.match(js, /import '\.\/campus-map-discovery\.js'/, 'CampusMap loads the dedicated facility discovery helper');
assert.match(js, /getTypeCounts\(features, activeDiscoveryFilter\)/, 'Facility type chips are derived from current campus published locations');
assert.match(js, /matchesType\(item, activeFeatureTypeFilter\)/, 'Broad categories and precise facility type filters are combined');
assert.match(js, /matchesSearch\(item, term\)/, 'Campus search uses accent-normalised aliases and Passport metadata');
assert.match(js, /updateSource\(matches\)/, 'Map markers and location cards use the same active discovery filters');
assert.match(js, /function updateSource\(items = features\)/, 'Filtered location source accepts the active subset instead of rendering all features');
assert.match(js, /selectedFeature && !matches\.some\(item => item\.id === selectedFeature\.id\)/, 'Filtering clears a Campus Passport selection that is no longer visible');
assert.match(js, /filterFeatures\(search\?\.value \|\| ''\)/, 'A newly loaded map style restores the active facility filter state');
assert.match(js, /data-campus-type-filter/, 'Facility type filter clicks are handled by the CampusMap module');
assert.match(js, /campus-map-results-summary/, 'Filtered published location counts are announced accessibly');
assert.match(js, /campus-map-clear-filters/, 'Students can clear category, type and text filters together');
assert.match(js, /isCampusAdmin && term \? adminDrafts\.filter/, 'Search results for private draft records remain admin-only');
assert.match(js, /item\.is_published && item\.campus_slug === selected && item\.latitude != null && item\.longitude != null/, 'Type counts only use published mapped locations for the selected campus');
assert.match(html, /id="campus-map-type-filters"[^>]*aria-label="Filter by facility type"/, 'Facility type filters have an accessible navigation label');
assert.match(html, /id="campus-map-results-summary" role="status" aria-live="polite"/, 'Facility result count is announced through a live status');
assert.match(html, /id="campus-map-clear-filters" hidden/, 'Clear filters is hidden until a filter is active');
assert.match(passportCss, /campus-map-type-filters/, 'Facility type chips have a responsive style system');
assert.match(passportCss, /html\[data-theme="dark"\] \.campus-map-type-filters/, 'Facility type chips are readable in dark mode');

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

assert.ok(Math.abs(geometry.parseOsmLength('12 ft') - 3.6576) < 1e-9, 'OSM feet measurements convert correctly');
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
  geometry: irregularWay.geometry.map((point, index) => index === 2 ? { lat: null, lon: point.lon } : point),
}), null, 'missing coordinates are rejected instead of being coerced to zero');
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


assert.match(html, /id="campus-map-coverage-overview"/, 'CampusMap presents a structured data-coverage summary');
assert.match(html, /id="campus-map-verified-count"/, 'Coverage summary exposes the verified campus-footprint count');
assert.match(html, /id="campus-map-record-count"/, 'Coverage summary exposes the actual loaded campus-footprint count');
assert.match(html, /id="campus-map-review-coverage-card" hidden/, 'Pending building review starts hidden');
assert.match(html, /id="campus-map-centre-state"/, 'Coverage summary exposes campus-centre confidence');
assert.match(html, /id="campus-map-boundary-state"/, 'Coverage summary exposes campus-boundary confidence');
assert.match(js, /function updateBuildingCoverageSummary\(\)/, 'Coverage summary reuses the current map data loader');
assert.match(js, /campusBuildings\.filter\(item => item\.verification_status === 'verified'\)\.length/, 'Verified footprint count includes only university-reviewed campus shapes');
assert.match(js, /setCoverageValue\('campus-map-verified-count', verified\)/, 'Verified footprint summary is populated from loaded campus records');
assert.match(js, /reviewCard\.hidden = !isCampusAdmin/, 'Pending map-review count remains visible only to verified campus administrators');
assert.match(js, /boundaryStatus === 'verified'/, 'Boundary coverage status is read from the saved campus profile');
assert.match(coverageCss, /campus-map-coverage-overview/, 'CampusMap coverage cards are styled responsively');
assert.match(css, /prefers-reduced-motion/, 'CampusMap visual controls retain reduced-motion support');


assert.match(html, /href="\.\/campus-map-passport\.css"/, 'Website and installable PWA load the Campus Passport styling layer');
assert.match(html, /id="campus-map-discovery-filters"/, 'CampusMap has task-oriented discovery filters');
for (const filter of ['all','academic','residential','services','access','emergency']) {
  assert.match(html, new RegExp('data-campus-filter="' + filter + '"'), 'CampusMap includes the ' + filter + ' discovery filter');
}
assert.match(html, /id="campus-map-passport"/, 'A location selection opens its Campus Passport card');
for (const id of [
  'campus-map-passport-title','campus-map-passport-facts','campus-map-passport-facilities',
  'campus-map-passport-accessibility','campus-map-passport-entrances',
  'campus-map-passport-route','campus-map-passport-accessible-route',
  'campus-map-passport-source','campus-map-passport-contact','campus-map-passport-emergency'
]) assert.ok(html.includes('id="' + id + '"'), 'Campus Passport exposes ' + id);
assert.match(html, /<option value="entrance">Entrance<\/option>/, 'Campus admins can classify dedicated entrance pins');
for (const id of [
  'campus-map-admin-building-code','campus-map-admin-opening-hours','campus-map-admin-floor-count',
  'campus-map-admin-facilities','campus-map-admin-accessibility-notes',
  'campus-map-admin-parent-building','campus-map-admin-entry-type','campus-map-admin-contact-url',
  'campus-map-admin-emergency-phone'
]) assert.ok(html.includes('id="' + id + '"'), 'Verified campus admin editor includes ' + id);
assert.match(html, /data-campus-accessibility/, 'Accessibility details use a constrained feature checklist');
assert.match(js, /function renderCampusPassport\(item\)/, 'Selected published campus locations render a real Passport panel');
assert.match(js, /function matchesCampusFilter\(item\)/, 'CampusMap filters are derived from the saved location category');
assert.match(js, /function resolveCampusRouteTarget\(accessibleOnly = false\)/, 'Walking routes resolve linked entrance records');
assert.match(js, /feature\.metadata\?\.building_feature_id === selectedFeature\.id/, 'Entrance routes only link to the selected building through the stored building reference');
assert.match(js, /feature\.metadata\?\.entry_type === 'accessible'/, 'Accessible routing requires a published, linked accessible entrance marker');
assert.match(js, /No verified accessible entrance is recorded/, 'The app explains when no accessible entrance has been verified instead of guessing');
assert.match(js, /map\.on\('click', 'campus-feature-points'/, 'Map markers open the matching Campus Passport');
assert.match(js, /p_metadata: passportMetadata/, 'Structured Passport details are sent through the checked CampusMap write RPC');
assert.match(js, /function buildPassportMetadata\(\)/, 'Admin Passport fields are validated and converted into metadata');
assert.match(js, /passportSafeHttps\(/, 'Campus Passport contact and evidence links are restricted to HTTPS');
assert.match(passportCss, /campus-map-passport/, 'Campus Passport panels have a dedicated visual system');
assert.match(passportCss, /@media\(max-width:420px\)/, 'Campus Passport cards adapt to narrow phones');
assert.match(passportCss, /prefers-reduced-motion:reduce/, 'Campus Passport controls respect reduced-motion');
assert.match(passportSql, /'entrance'/, 'Staging migration supports dedicated entrance feature records');
assert.match(passportSql, /p_metadata jsonb/, 'Staging RPC accepts structured Passport metadata');
assert.match(passportSql, /security invoker/i, 'Exposed Passport RPC wrapper is SECURITY INVOKER');
assert.match(passportSql, /A verified campus administrator is required/, 'Passport writes preserve the verified campus admin requirement');
assert.match(passportSql, /p_parent_is_published|v_parent_is_published/, 'Published entrance records are gated by the related published campus building');
assert.match(passportSql, /step_free_entry[\s\S]*accessible_restroom/, 'Accessibility attributes use an explicit allowlist');
assert.match(passportSql, /p_source_url IS NULL|p_source_url is null/, 'Verification still requires location evidence');
assert.doesNotMatch(passportSql, /create table/i, 'Campus Passport reuses existing metadata and does not add a public table');
assert.match(passportMergeSql, /existing_metadata[\s\S]*p_metadata/, 'Metadata merge retains pre-existing OSM and verification provenance');
assert.match(passportCompatSql, /if p_metadata is null then[\s\S]*jsonb_each/, 'Legacy clients that omit Passport metadata retain existing detail fields');
assert.match(passportMergeSql, /revoke all on function public\.manage_campus_map_feature/i, 'Exposed Passport RPC execution remains narrowly granted');
assert.match(passportCompatSql, /revoke all on function private\.manage_campus_map_feature_with_metadata_impl/i, 'Legacy metadata compatibility implementation is not directly public');
assert.match(js, /route path itself is not certified step-free/i, 'The UI does not claim that routing data proves the whole path is accessible');


assert.match(passportParentGuardSql, /campus_map_feature_parent_not_self/, 'Database prevents a map location from referencing itself as its parent building');
assert.match(passportParentGuardSql, /metadata->>'building_feature_id' <> id::text/, 'Parent self-reference validation is enforced by a database check constraint');
assert.match(js, /item\.id !== editingId/, 'Admin parent selector excludes the map record currently being edited');
assert.match(html, /campus-map-passport-entry-fields" hidden/, 'Entrance-only parent/type controls are hidden for ordinary buildings');
assert.match(js, /accessibleOption\.hidden = featureType === 'entrance'/, 'Accessible entrance type is only selectable on the accessible-entry location type');


assert.match(babcockDirectorySql, /Babcock Main Campus official-name candidate directory/, 'Babcock directory seed is scoped to the official-name candidate workflow');
assert.match(babcockDirectorySql, /cp\.campus_slug='main-campus'/, 'Official Babcock candidates target Main Campus rather than mixing Iperu records');
assert.match(babcockDirectorySql, /null,null,null,'pending',null,null,false/, 'New official names are seeded without coordinates or exact-point evidence and remain unpublished');
assert.match(babcockDirectorySql, /name_source_url/, 'Official building-name evidence is stored separately from point evidence');
for (const candidate of [
  'Gideon Troopers Hall','Bethel Splendor Hall','Samuel Akande Hall',
  'Felicia Adebisi Dada Hall','Platinum Hall','Justice Deborah Hall',
  'Neal Wilson Hall','Welch Hall','Crystal Hall','Gamaliel Hall',
  'White Hall','Nybergr Hall','Ogden Hall',
  'BUCODeL (Centre for Open Distance and e-Learning)',
  'Ellen G. White-SDA Research Centre','Pioneer SDA Church (University Church)',
  'Swimming Pool','Table Tennis Court','Volleyball Court','Basketball Court',
  'Catering and Food Services','BUCare Student Support'
]) assert.ok(babcockDirectorySql.includes(candidate), 'Official Babcock candidate directory includes ' + candidate);
assert.match(babcockDirectorySql, /emergency_phone','\+234 811 891 8368'/, 'BUTH official emergency contact is recorded as a campus service detail');
assert.match(babcockDirectorySql, /opening_hours','Emergency Department · 24\/7'/, 'BUTH emergency availability is recorded from the official source');
assert.match(babcockEvidenceCleanupSql, /source_url = null/, 'Name-only and service-only source URLs are never treated as exact point evidence');
assert.match(js, /function renderAdminDrafts\(\)/, 'CampusMap admin draft list is available for verified campus admins');
assert.match(js, /Official name source/, 'CampusMap admin draft cards show official name sources');
assert.match(js, /Community coordinate candidate/, 'CampusMap admin cards separately label community-mapped coordinate sources');
assert.match(js, /coordinate_note/, 'CampusMap admin draft cards explain the remaining coordinate verification requirement');
assert.match(passportCss, /campus-map-admin-draft-links/, 'Admin source links are styled within the CampusMap draft cards');


assert.match(babcockDirectorySql, /Laz Otti Memorial Library/, 'Babcock Main Campus candidate directory retains the central Library');
assert.match(babcockDirectorySql, /BUCare Student Support/, 'Babcock Main Campus directory includes the official BUCare service point');
assert.match(babcockDirectorySql, /Babcock University Teaching Hospital/, 'Babcock Main Campus directory includes the teaching hospital');
assert.match(babcockDirectorySql, /Official Library page: Laz Otti Memorial Library is directly opposite BUCODeL/, 'The Library-to-BUCODeL relationship is stored as official context rather than fabricated geometry');
assert.match(babcockEvidenceCleanupSql, /source_url = null/, 'Name-only official URLs are removed from exact-point evidence');
assert.match(babcockCoordinateStatusSql, /coordinate_status/, 'Every pending Main Campus record receives an explicit coordinate-confidence state');
assert.match(babcockCoordinateStatusSql, /source_url = null/, 'Pending Babcock candidates cannot retain an unqualified point-evidence URL');
assert.match(babcockCoordinateStatusSql, /community-mapped candidate only/i, 'Community coordinates remain distinguishable from verified campus coordinates');
assert.match(js, /official_info_source_url/, 'CampusMap admin drafts surface official information sources separately');
assert.match(js, /coordinate_source_url/, 'CampusMap admin drafts surface community coordinate candidates separately');
assert.match(js, /no coordinates · exact on-campus pin required/, 'CampusMap admin drafts explain when an exact pin is still missing');

assert.match(html, /id="campus-map-profile-boundary-file"/, 'Verified campus admins can load a local GeoJSON boundary file');
assert.match(html, /accept="\.geojson,\.json,application\/geo\+json,application\/json"/, 'Boundary intake accepts GeoJSON files only');
assert.match(html, /maximum 2 MB/, 'Boundary file intake communicates its size limit');
assert.match(js, /function loadCampusBoundaryFile\(\)/, 'Boundary GeoJSON is loaded through an explicit guarded handler');
assert.match(js, /campus-map-profile-boundary-verified'\)\.checked = false/, 'A loaded boundary is always reset to an unverified candidate');
assert.match(js, /campus-map-profile-boundary-file'\)\?\.addEventListener\('change', loadCampusBoundaryFile\)/, 'Boundary file selection is wired to the safe local parser');
assert.match(geometrySource, /function extractCampusBoundaryGeometry\(value\)/, 'GeoJSON parser extracts only a single Polygon or MultiPolygon');
assert.equal(geometry.extractCampusBoundaryGeometry({ type: 'Polygon', coordinates: [] })?.type, 'Polygon', 'Direct Polygon geometry is accepted for later coordinate validation');
assert.equal(geometry.extractCampusBoundaryGeometry({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] } })?.type, 'MultiPolygon', 'Single GeoJSON Features can be loaded');
assert.equal(geometry.extractCampusBoundaryGeometry({ type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: [] } }] })?.type, 'Polygon', 'Single-feature GeoJSON FeatureCollections can be loaded');
assert.equal(geometry.extractCampusBoundaryGeometry({ type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: [] } }, { geometry: { type: 'Polygon', coordinates: [] } }] }), null, 'Multi-feature collections are rejected until dissolved into one boundary');
assert.equal(geometry.extractCampusBoundaryGeometry({ type: 'Point', coordinates: [3.7, 6.8] }), null, 'Point GeoJSON cannot be mistaken for a campus boundary');

const validateCampusBoundaryGeometry = geometry.validateCampusBoundaryGeometry;
const valid2dBoundary = { type: 'Polygon', coordinates: [[[3.7, 6.8], [3.71, 6.8], [3.71, 6.81], [3.7, 6.8]]] };
assert.equal(validateCampusBoundaryGeometry(valid2dBoundary), true, 'Valid two-dimensional boundary coordinates are accepted');
const valid3dBoundary = { type: 'Polygon', coordinates: [[[3.7, 6.8, 12], [3.71, 6.8, 12], [3.71, 6.81, 12], [3.7, 6.8, 12]]] };
assert.equal(validateCampusBoundaryGeometry(valid3dBoundary), true, 'Valid GeoJSON positions with elevation are accepted');
const invalidNullBoundary = { type: 'Polygon', coordinates: [[[null, 6.8], [3.71, 6.8], [3.71, 6.81], [null, 6.8]]] };
assert.equal(validateCampusBoundaryGeometry(invalidNullBoundary), false, 'Null values cannot be coerced into zero-valued coordinates');
const invalidEmptyStringBoundary = { type: 'Polygon', coordinates: [[['', 6.8], [3.71, 6.8], [3.71, 6.81], ['', 6.8]]] };
assert.equal(validateCampusBoundaryGeometry(invalidEmptyStringBoundary), false, 'Empty strings cannot be coerced into zero-valued coordinates');
const invalidStringBoundary = { type: 'Polygon', coordinates: [[['3.7', 6.8], [3.71, 6.8], [3.71, 6.81], ['3.7', 6.8]]] };
assert.equal(validateCampusBoundaryGeometry(invalidStringBoundary), false, 'GeoJSON coordinate values must be actual JSON numbers');
const invalidElevationClosure = { type: 'Polygon', coordinates: [[[3.7, 6.8, 1], [3.71, 6.8, 1], [3.71, 6.81, 1], [3.7, 6.8, 2]]] };
assert.equal(validateCampusBoundaryGeometry(invalidElevationClosure), false, 'A closed 3D ring must match every coordinate dimension at its endpoints');


assert.match(html, /id="campus-map-layers-toggle"/, 'CampusMap exposes an accessible layer control button');
assert.match(html, /aria-controls="campus-map-layer-panel"/, 'Layer control button identifies its expandable panel');
assert.match(html, /id="campus-map-layer-panel"[^>]*hidden/, 'Layer panel is collapsed by default');
for (const layer of ['locations','boundary','buildings','roads','labels','drafts']) {
  assert.match(html, new RegExp('data-map-layer="' + layer + '"'), 'CampusMap exposes the ' + layer + ' visibility toggle');
}
assert.match(html, /id="campus-map-layer-drafts-option"[^>]*hidden/, 'Admin-only draft pin control is hidden by default');
assert.match(css, /campus-map-layer-panel/, 'CampusMap layer panel has a dedicated style system');
assert.match(css, /campus-map-stage\.has-layer-panel \.campus-map-legend/, 'The map legend yields space while the layer panel is open');
assert.match(css, /html\[data-theme="dark"\] \.campus-map-layer-panel/, 'Map layer controls support the dark theme');
assert.match(js, /MAP_LAYER_STORAGE_KEY/, 'Layer preferences are persisted locally');
assert.match(js, /function applyMapLayerPreferences\(\)/, 'Layer visibility is centralised in one map preference function');
assert.match(js, /baseStyleRoadLayerIds/, 'Street basemap road layers are independently controllable');
assert.match(js, /baseStyleBuildingLayerIds/, 'Vector basemap building footprints are independently controllable');
assert.match(js, /!isBuilding \|\| preferences\.buildings/, 'The building toggle applies to vector basemap buildings');
assert.match(js, /baseStyleLabelLayerIds/, 'Basemap labels are independently controllable');
assert.match(js, /key === 'drafts' && !isCampusAdmin/, 'Admin draft pins remain restricted to verified campus admins');
assert.match(js, /event\.key === 'Escape'/, 'Layer panel supports Escape-key dismissal');
assert.match(js, /setMapLayerPanelOpen\(false\)/, 'Layer panel can close without changing map data');

console.log('CampusMap static smoke checks passed.');
