# CampusMap provider decision

**Status:** staging-first provider decision and implementation notes  
**Date:** 2026-10-31  
**Scope:** this document applies to CampusMap only; it does not change the ShieldMind Agent Stack or production configuration. A branch-scoped GitHub Actions workflow runs map syntax, CampusMap smoke and full Node smoke checks for this follow-up.

## Decision

Keep **MapLibre GL JS** as the rendering engine. Use **OpenFreeMap Liberty** as the default vector street basemap, retain Esri World Imagery as the optional satellite layer, and keep MapTiler Terrain RGB as an optional, domain-restricted terrain source. Continue using the university-scoped CampusShield building-footprint review table as the preferred source for campus-specific 3D geometry.

The new default style URL is:

`https://tiles.openfreemap.org/styles/liberty`

OpenFreeMap's official quick start documents hosted style URLs for MapLibre, including Liberty, Bright, Positron, Dark, Fiord and 3D. The vector basemap supplies mapped roads, place labels, land-use and building context that the previous raster OpenStreetMap base did not style as richly. Custom transportation layers are now only switched on for satellite and 3D modes, where they act as road/path overlays over imagery rather than duplicating the 2D vector map.

## Provider comparison

| Layer | Provider / code | CampusShield decision |
|---|---|---|
| Map renderer | MapLibre GL JS | Keep. The existing interactions, campus overlays, camera and controls already depend on it. |
| Default street map | OpenFreeMap Liberty | Use as the no-key vector basemap for 2D. |
| Roads and footpaths over imagery | OpenFreeMap / OpenMapTiles transportation layer | Keep the existing mapped geometry; show only in SAT/3D modes. Never draw invented connectors. |
| Satellite | Esri World Imagery | Keep as an optional layer. Resolution and capture date vary by location; retain provider attribution. |
| Terrain elevation | MapTiler Terrain RGB v2 | Optional only. The public browser key must be restricted to CampusShield domains. No key is required for normal 2D or satellite modes. |
| Campus-specific buildings | `campus_map_buildings` | Preferred source once imported, checked and verified by a campus administrator. |
| Photorealistic campus models | University survey / approved GLB or 3D Tiles source | Future enhancement only. Do not fabricate geometry or imply block extrusions are architectural models. |

## MapTiler cost and licence guardrail

MapTiler Cloud's published Free tier is described as suitable for testing, personal or non-commercial use, with 5,000 map sessions, 2,000 3D sessions and 100,000 API requests per month. The same pricing page lists Flex at $30/month before extra traffic charges. Its Free service pauses when a plan quota is exhausted. CampusShield should not assume the Free tier is suitable for a commercial production service. Before enabling MapTiler for production, check the current licence, monthly quotas, overage rates and usage analytics, then approve a budget.

The existing `campus-map-config.js` field is a **public browser key slot**, not a place for a server secret. Restrict any key by production/staging hostname and API scope. Do not add a key merely to display the default vector basemap.

## Why MapLibre v6 is not part of this change

The project currently loads MapLibre 4.7.1 through a classic deferred script. The current MapLibre release line is 6.x; however, v6 is ESM-only and requires WebGL2, while this app's broad responsive-device target includes older mobile hardware. A safe upgrade therefore needs a separate browser-compatibility exercise, module-loading change and real-device matrix. This PR deliberately changes the style provider without also changing the renderer version.

## Data quality and Babcock readiness

The Staging inspection on 2026-10-31 found:

- 22 campus feature records in `campus_map_features`.
- 0 imported building footprints in `campus_map_buildings`.
- Babcock Main Campus has an official locator centre from the university contact page, but its centre status is `official_locator`, not a surveyed building coordinate.
- Babcock Iperu Campus has no centre coordinates recorded.

The vector basemap can improve roads, place labels and mapped building coverage, but it cannot supply missing campus-specific information reliably. OpenStreetMap building outlines are community map data and must remain candidates until a verified campus administrator checks the outline, name, entrance and evidence. Exact building heights should be shown as tagged, estimated from level counts, or visual fallbacks; the interface must keep those categories distinct.

## Acceptance checks

1. The 2D mode loads the OpenFreeMap Liberty vector style and displays its labels and street geometry.
2. SAT and 3D modes retain Esri imagery with the app's custom mapped roads/paths above it.
3. 2D does not show duplicate custom road overlays on top of the provider's own vector roads.
4. Campus features, draft visibility, RLS, university scoping, admin review and incident privacy remain unchanged.
5. No new API key, paid service, migration, Supabase write or production deployment is required for this change.
6. Test at the existing responsive widths and with real Babcock campus-admin authentication before merging the parent CampusMap PR.

## References

- OpenFreeMap quick start: https://openfreemap.org/quick_start/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre v5-to-v6 migration guide: https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/
- MapTiler Cloud pricing: https://www.maptiler.com/cloud/pricing/
- MapTiler Terrain RGB source specification: https://docs.maptiler.com/gl-style-specification/sources/
- Babcock University official contact page: https://www.babcock.edu.ng/contact
- Babcock University sitemap: https://www.babcock.edu.ng/sitemap

