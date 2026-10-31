# CampusMap — multi-university rollout

## Current staging implementation
CampusMap is integrated as a university-scoped workspace page. It includes MapLibre rendering, OpenStreetMap basemap attribution, search, campus selector (Main Campus / Iperu Campus), verified-location pins, emergency category filtering, optional user geolocation, walking directions, and a campus administrator manager.

The Campus Map Manager is shown only to an authenticated, verified campus administrator. Browser table writes are revoked. The UI writes through a checked RPC that verifies the caller's own active, verified campus-admin membership and scopes all changes to that university. Locations remain drafts until coordinates and an HTTPS evidence source are supplied and the admin explicitly verifies them. Publishing requires verified coordinates and evidence.

## Babcock pilot directory
The staging migrations seed 22 Babcock location entries: 18 Main Campus and 4 Iperu Campus. The original 12 named places were pending and unpublished. A further 10 Main Campus entries now have OSM-derived coordinate candidates (BBS Babcock Business School, BUSA House, Bursary, Nelson Mandela Hall, Winslow Hall, Ameyo Adadevoh Hall, Havilah Gold Hall, Queen Esther Hall, School Cafeteria, and Science and Technology). All community-mapped points remain pending and unpublished until an authorized campus administrator checks the exact entrance or building footprint.

Official sources:
- Arrival guide: https://www.babcock.edu.ng/new-students-info
- Laz Otti Memorial Library: https://www.babcock.edu.ng/library
- Babcock University Teaching Hospital emergency services: https://buth.babcock.edu.ng/emergency-services/

The arrival guide identifies the University Gate, halls of residence, Amphitheatre, University Stadium, Registry, Student Development, and Iperu arrival locations. The library page locates Laz Otti Memorial Library opposite BUCODEL. The BUTH emergency page lists the hospital emergency contact. These pages provide named places and services but not precise building-level map coordinates. A campus survey or university-approved coordinate source is still required before pins can be published.

## Emergency and incident layers
Medical, security, emergency-point, assembly-point and gate features can be filtered as emergency locations. The incident overlay is restricted to verified campus security/admin roles and uses the existing incidents RLS rules. It selects only incident ID, category, severity, status, textual location, creation time and optional coordinates; it does not select reporter identity or incident descriptions.

The incident form now offers an optional GPS attachment. The browser asks for permission, and a text-only report can still be submitted if permission is denied. Coordinates are stored on the incident row and displayed to authorized same-university staff only. Existing incidents have null coordinates until users voluntarily attach a pin.

## Satellite and 3D building support
CampusMap now has three modes. **2D** uses OpenStreetMap raster tiles. **SAT** uses Esri World Imagery tiles and adds OpenStreetMap place labels. **3D** combines Esri imagery with OpenFreeMap/OpenMapTiles building-footprint extrusions and OSM place labels, with a tilted camera. The Esri image and OpenFreeMap vector sources do not require a MapTiler key. Esri imagery attribution is shown in the map. OpenFreeMap data is based on OpenStreetMap and the tile service attribution is retained by MapLibre.

The OpenMapTiles building layer provides `render_height`, `render_min_height`, `colour` and `hide_3d` attributes. Height fields are approximate values derived from OSM height and level tags; when absent, the 3D style uses a fallback height. Coverage and building names depend on local OSM mapping. This produces extruded block models, not realistic roof geometry, facade textures or a certified campus model. The optional MapTiler key in `campus-map-config.js` is only used for terrain elevation; never put a secret key in browser code. Detailed textured models require university-approved building geometry or a suitable licensed 3D provider.

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
6. Test 2D, SAT and 3D without a provider key. Configure an optional domain-restricted MapTiler public key only when terrain elevation is needed.
7. Run mobile browser tests and verify walking route behavior and provider failure states.
8. Do not merge to production until authenticated staging tests and security review pass.


The Babcock Main Campus map now opens at the university-level Google Maps locator embedded on its official contact page (approximately 6.8910932, 3.7191259). It is explicitly labelled as a campus locator, not a building entrance. Individual building pins remain unpublished until verified.


## Optional MapTiler terrain setup
1. The 2D, SAT and 3D modes do not require a MapTiler key. Only follow these steps when optional terrain elevation is required.
2. Create a MapTiler account and generate a browser/public API key.
3. Restrict the key by allowed HTTP referrers to the CampusShield staging preview hostname and the approved production domain(s). Do not use an unrestricted key.
4. Put the restricted public key in `campus-map-config.js` as the value of `window.CampusShieldMapConfig.maptilerKey`.
5. Keep secret/server keys out of the repository and browser code; verify terrain loads, while satellite imagery and OSM building extrusions continue to work without the key.


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

## Reference-style satellite and 3D map modes
- The CampusMap style picker offers **2D**, **SAT** and **3D** modes, with a vertical mobile-friendly control similar to the supplied reference.
- SAT uses the Esri World Imagery raster tile service with its published attribution. The source is capped at zoom level 12 so MapLibre reuses the last broadly available worldwide imagery tile at building-scale camera zooms rather than requesting unavailable local high-detail tiles. Image capture date, resolution and sharpness vary by location.
- 3D displays satellite imagery underneath OpenFreeMap vector building footprints from the OpenMapTiles `building` source layer. `render_height` and `render_min_height` are approximated from mapped OSM height/level tags; unmapped or unheighted buildings may appear as simple fallback-height extrusions.
- The OSM `poi` layer adds building/place labels where names exist. The custom map style includes OpenFreeMap's glyph endpoint and Open Sans font stack; without glyphs, symbol layers can render with missing labels.
- The 3D view is an OSM-derived block extrusion. It is not a photogrammetric mesh like a fully textured 3D city model. Exact roof shapes, facade textures, tree canopies and completeness require mapped geometry or verified university-supplied models.
- Map providers and data attribution must remain visible: Esri imagery providers; OpenFreeMap/OpenMapTiles; OpenStreetMap contributors.
- OpenFreeMap's public tile service is free and keyless but is provided as-is without an SLA. For a production-critical university platform, monitor availability and consider self-hosting or a contracted tile provider as traffic grows.

Babcock has an OSM campus boundary and multiple named campus POIs in community mapping, including the Amphitheatre, BBS Babcock Business School, BuCodel, Bursary and nearby residences. This gives the 3D view useful place-label coverage, but named POIs do not guarantee complete building footprint or height data. Treat any displayed shape/height as community map data until a university site survey confirms it.


### Additional Main Campus candidate references
The additional OSM candidates have their coordinate source URL and OSM node ID stored separately from verification evidence:
- BBS Babcock Business School — https://mapcarta.com/N11750260583
- BUSA House — https://mapcarta.com/N11750260577
- Bursary — https://mapcarta.com/N11750260570
- Nelson Mandela Hall — https://mapcarta.com/N11750260574
- Winslow Hall — https://mapcarta.com/N11750228864
- Ameyo Adadevoh Hall — https://mapcarta.com/N11750293373
- Havilah Gold Hall — https://mapcarta.com/N11750293374
- Queen Esther Hall — https://mapcarta.com/N11750260575
- School Cafeteria — https://mapcarta.com/N11750211718
- Science and Technology — https://mapcarta.com/N11750260584

These are community-mapped point features. The coordinates locate mapped POIs, not necessarily doorways or building footprints. The edit form deliberately clears the coordinate evidence field for these candidates. A university-approved survey or on-site administrator check is still required.

## Responsive layout and map performance update
- Desktop widths use a two-column map and manager layout. Tablet widths stack the map above the location panel; phone widths use a shorter viewport-aware map with a compact side control rail. Landscape phones have their own height rule.
- A ResizeObserver, window resize and orientation-change listener keep the WebGL canvas aligned after sidebars, panels and screen orientation change. Resize work is frame-coalesced to avoid repeated expensive redraws.
- Native MapLibre attribution is shown in compact mode. The duplicate manually-authored attribution strip has been removed, so provider credits no longer overlap the marker legend.
- Admin draft pins are clustered at campus scale, expand on click, shrink at high zoom and reveal names only when there is enough screen space. This prevents a dense orange marker field.
- OpenMapTiles vector data uses maxzoom 14 and is overzoomed for closer inspection, which avoids unnecessary requests beyond its generated zoom range. The 3D layer has subtle building outlines and uses the named POI layer for mapped place labels; the building source is not incorrectly treated as if it carries names.
- MapLibre is capped at a 60-degree pitch to avoid experimental pitches beyond the normal supported range. Camera transitions are shorter, and the selected point camera respects the current 2D or 3D mode.
- Reduced-motion preferences are respected by CSS controls and JavaScript camera transitions. Resource errors now report a relevant fallback message instead of leaving the map status silent.
- All MapLibre text layers now share the OpenFreeMap Noto Sans glyph service, fixing missing location, POI and cluster labels in the custom raster-plus-vector style.
