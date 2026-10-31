# CampusMap — multi-university rollout

## Current staging implementation
CampusMap is integrated as a university-scoped workspace page. It includes MapLibre rendering, OpenStreetMap basemap attribution, search, campus selector (Main Campus / Iperu Campus), verified-location pins, emergency category filtering, optional user geolocation, walking directions, and a campus administrator manager.

The Campus Map Manager is shown only to an authenticated, verified campus administrator. Browser table writes are revoked. The UI writes through a checked RPC that verifies the caller's own active, verified campus-admin membership and scopes all changes to that university. Locations remain drafts until coordinates and an HTTPS evidence source are supplied and the admin explicitly verifies them. Publishing requires verified coordinates and evidence.

## Babcock pilot directory
The staging migration seeds 12 official Babcock place names as pending/unpublished records without coordinates. It separates the Main Campus (8 places) from the Iperu Campus (4 places). No building coordinates have been guessed.

Official sources:
- Arrival guide: https://www.babcock.edu.ng/new-students-info
- Laz Otti Memorial Library: https://www.babcock.edu.ng/library
- Babcock University Teaching Hospital emergency services: https://buth.babcock.edu.ng/emergency-services/

The arrival guide identifies the University Gate, halls of residence, Amphitheatre, University Stadium, Registry, Student Development, and Iperu arrival locations. The library page locates Laz Otti Memorial Library opposite BUCODEL. The BUTH emergency page lists the hospital emergency contact. These pages provide named places and services but not precise building-level map coordinates. A campus survey or university-approved coordinate source is still required before pins can be published.

## Emergency and incident layers
Medical, security, emergency-point, assembly-point and gate features can be filtered as emergency locations. The incident overlay is restricted to verified campus security/admin roles and uses the existing incidents RLS rules. It selects only incident ID, category, severity, status, textual location, creation time and optional coordinates; it does not select reporter identity or incident descriptions.

The incident form now offers an optional GPS attachment. The browser asks for permission, and a text-only report can still be submitted if permission is denied. Coordinates are stored on the incident row and displayed to authorized same-university staff only. Existing incidents have null coordinates until users voluntarily attach a pin.

## Satellite and 3D building support
The 2D and tilted MapLibre views work without a key. Satellite tiles, terrain and 3D building-footprint extrusions are optional MapTiler layers. Configure a domain-restricted public key at window.CampusShieldMapConfig.maptilerKey to enable them. Do not place a secret key in browser code. The 3D buildings are vector-footprint extrusions, not photogrammetric models; detailed textured building models require verified geometry and a suitable licensed provider.

## Multi-university security
- Map features are linked to campus_universities by university_id.
- Anonymous users can read published locations only.
- Authenticated students and staff can read published locations.
- Verified campus administrators can additionally read and manage drafts for their own university.
- Direct browser INSERT/UPDATE/DELETE grants are revoked.
- The admin RPC validates the signed-in profile and campus membership on every write.
- Incident pins use the existing same-campus incident RLS rules.

## Staging acceptance gates
1. Confirm the migration exists only in CampusShield AI Staging and run Supabase advisors.
2. Test anonymous published-only reads and authenticated draft access with a verified campus-admin account.
3. Test two universities and Babcock Main Campus / Iperu Campus for strict data separation.
4. Capture exact Babcock coordinates through an authorized campus survey or approved source; do not publish approximate pins.
5. Verify GPS permission denied/allowed paths, incident coordinate persistence, staff-only incident visibility, and reporter privacy.
6. Configure a restricted MapTiler key before testing satellite, terrain and building extrusion layers.
7. Run mobile browser tests and verify walking route behavior and provider failure states.
8. Do not merge to production until authenticated staging tests and security review pass.


The Babcock Main Campus map now opens at the university-level Google Maps locator embedded on its official contact page (approximately 6.8910932, 3.7191259). It is explicitly labelled as a campus locator, not a building entrance. Individual building pins remain unpublished until verified.


## MapTiler key setup
1. Create a MapTiler account and generate a browser/public API key.
2. Restrict the key by allowed HTTP referrers to the CampusShield staging preview hostname and the approved production domain(s). Do not use an unrestricted key.
3. Put the restricted public key in campus-map-config.js as the value of window.CampusShieldMapConfig.maptilerKey.
4. Keep secret/server keys out of the repository and browser code.
5. Re-run the staging map tests and verify satellite imagery, terrain, and the building layer load before promoting the feature.


The Babcock University Teaching Hospital draft stores its official emergency line (+234 811 891 8368) as public location metadata. Once an authorized campus administrator verifies the hospital pin and publishes it, CampusMap can display the emergency line alongside that location.


## Precision mapping update (staging)
- Campus camera centring now waits for the MapLibre style-load lifecycle and re-applies the campus view after map layers load. The Babcock Main Campus opens near the official campus locator at building-level zoom rather than leaving the user at a Nigeria-wide view.
- Administrators can select the exact point by clicking the map, enter a coordinate pair manually and preview it, or capture device GPS. GPS accuracy reported by the browser is displayed; it is not treated as proof of building identity.
- The provisional amber marker is draggable for refinement. Pending coordinates appear in a separate admin-only draft layer and can be clicked to reopen their edit form. Public and student views never receive unpublished draft coordinates.
- Verification and publication remain separate actions. The interface requires a coordinate pair and HTTPS evidence source before marking a pin verified; publication also requires the verified flag. All draft candidates remain unpublished until a verified university administrator checks the location on site or against an approved survey.
- The OSM candidate's place-name source and coordinate source are kept separately. When an administrator edits a community-mapped candidate, the exact-coordinate evidence field is intentionally cleared; the admin must supply an approved survey or other evidence for that precise point before verification.
- Map scale is labelled as regional, campus-area or building-level to avoid suggesting false precision.

### Community-mapped coordinate candidates
Two Main Campus names have candidate coordinates from OpenStreetMap features surfaced via Mapcarta:
- Amphitheatre: 6.89088, 3.72242 — https://mapcarta.com/N11750218077
- University Stadium: 6.89472, 3.72770 — https://mapcarta.com/N11750284266

These are community-mapped OSM point candidates, not university-certified entrance coordinates. They are stored as pending, unpublished draft coordinates with the OSM source and object ID recorded in metadata. They must be independently checked before verification or publication. Other named places, including BUTH, Registry, halls, Student Development and the Iperu Campus facilities, remain without coordinates until a reliable exact source is available.
