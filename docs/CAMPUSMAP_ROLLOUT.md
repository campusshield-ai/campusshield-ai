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
