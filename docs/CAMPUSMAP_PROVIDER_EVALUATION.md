# CampusMap base-map and building-data provider evaluation

**Review date:** 31 October 2026  
**Renderer decision:** keep MapLibre GL JS.  
**Pilot decision:** OpenFreeMap Liberty for staging and low-risk pilot use; keep the base style configurable.  
**Production decision:** do not make any public free tile endpoint the only emergency-map dependency. Select a paid provider only after its exact plan, terms, operational commitment, regional coverage, and total monthly cost are confirmed. Otherwise host our own vector archive and define an operations/availability plan.

## 1. The renderer: MapLibre GL JS

MapLibre is already the correct foundation for CampusShield. It renders vector tiles using WebGL, supports custom style layers and feature overlays, and avoids forcing a migration of CampusShield's campus-specific GeoJSON, routes, search and admin tools. Version 6.16.0 is the current release on the review date. Version 6 is ES-module-only: use the .mjs bundle and a module bootstrap, not the removed classic UMD .js global. See [MapLibre quick start](https://maplibre.org/maplibre-gl-js/docs/) and [v5-to-v6 migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/).

## 2. Tile/style provider choices

| Option | Current public terms / price found | Best role in CampusShield | Limitations |
|---|---|---|---|
| OpenFreeMap Liberty | Free public instance; no key or registration advertised | Staging, development and pilot while traffic is modest | Terms say as-is, no warranty for availability or accuracy, and service may be discontinued. Not a sole production emergency-map dependency. |
| MapTiler Cloud Flex | Listed at $30/month USD; 25,000 sessions included, extra usage priced separately | A commercial option for custom styles, tiles and storage; can be tested behind the existing configurable style URL | Public terms state best-effort availability. A custom SLA and premium support need a separate agreement; do not assume the standard plan includes an SLA. |
| Stadia Maps Starter | Listed at $20/month USD and 1,000,000 credits/month; paid subscription required for commercial use | A lower-cost commercial vector-basemap option to benchmark against MapTiler | Standard plan is $80/month if its satellite basemap is needed. Current terms say services are provided as-is and do not warrant uninterrupted, secure or error-free service; the public terms do not establish an SLA. CampusShield already has a separate Esri imagery layer, so the satellite tier is not automatically needed. |
| Self-hosted PMTiles | Tile archive served as a static object with HTTP byte-range requests; infrastructure cost depends on storage/CDN/egress | Long-term control, versioned map releases and reduced dependence on an external tile vendor | CampusShield must generate/update the archive, monitor hosting, provide CORS and byte-range support, and run an operational plan. Self-hosting is not automatically high availability. |

Sources and terms checked:
- [OpenFreeMap service](https://openfreemap.org/) and [OpenFreeMap Terms of Service](https://openfreemap.org/tos/)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/) and [MapTiler Cloud terms](https://www.maptiler.com/terms/cloud/)
- [Stadia Maps pricing](https://stadiamaps.com/pricing/) and [Stadia Maps terms](https://stadiamaps.com/terms-of-service/)
- [PMTiles MapLibre guidance](https://docs.protomaps.com/pmtiles/maplibre) and [PMTiles hosting guidance](https://docs.protomaps.com/pmtiles/cloud-storage)

The old direct tile.openstreetmap.org raster endpoint is removed from the 2D base style. OSM Foundation says its public raster service is donation-funded, has limited capacity, is best-effort without an SLA, and may block access that harms the service. See [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).

## 3. What will make Babcock look like Babcock

Changing the world basemap does not create missing campus detail. Staging currently has no rows in campus_map_buildings; Babcock's main-campus boundary is missing and all 22 Babcock feature candidates remain pending and unpublished. The accurate next improvement is better university-specific geometry:

1. Ask Babcock's ICT/ITDS and Physical Planning/Works teams for an approved campus boundary, building outlines, names, entrance coordinates, and (where available) floor counts/heights or architectural/BIM models. Request GeoJSON/Shapefile for footprints and glTF/GLB for selected visual models, with permission to display them in CampusShield.
2. Use OpenStreetMap/Overpass as a candidate discovery and import source, not as university certification. Import polygon building ways into the existing campus_map_buildings candidate workflow; preserve OSM object identifiers, source URLs and ODbL attribution. The existing import RPC leaves all geometry pending and unpublished and requires evidence before verification/publication.
3. Do not fabricate a campus boundary from the campus centre point. The university's current contact page embeds a Google Maps locator at the recorded centre, but a centre coordinate is not a legal or surveyed boundary. See [Babcock Contact](https://babcock.edu.ng/contact).
4. Keep building names, entrance pins, gate locations, emergency assembly locations and emergency routes as separate feature types. Emergency routes must come from a university-approved map or a validated staff survey; never infer them from road geometry.
5. Use a 3D building layer for broad OSM footprints, then selectively replace high-value Babcock buildings with verified university-supplied models. Label data provenance and verification state in the admin UI.

Useful discovery tools:
- [OpenStreetMap](https://www.openstreetmap.org/)
- [Overpass Turbo](https://overpass-turbo.eu/) for one-off footprint queries
- [OpenStreetMap Overpass API overview and usage policies](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [QGIS](https://qgis.org/) for inspecting, cleaning and exporting surveyed boundary/footprint files
- [Protomaps / PMTiles](https://protomaps.com/) for a self-hostable vector tile archive

The public Overpass instances are intended for modest use and may be overloaded; their guidance recommends self-hosted or paid services for repeated commercial use. Do not place a large recurring Overpass import in the live user map request path. Run a controlled, cached, owner-only import and review the candidates before publication.


## 3. Building-data candidates and real 3D models

### Overture Maps Buildings

Overture Maps' Buildings theme is a useful second candidate source for Babcock. It has global coverage and separates outer building footprints (`building`) from constituent building parts (`building_part`). The source documentation is explicit about a material limitation: a larger share of Global South coverage comes from machine-learning-derived data, and footprint precision is lower there. Overture prioritises community-edited OpenStreetMap data in its conflation, but the composite Buildings theme is published under ODbL because it includes OSM data. Keep Overture records in the candidate/review pipeline, retain the GERS ID and release provenance, and do not auto-verify or publish a footprint just because it appears in the dataset. See [Overture Buildings coverage, structure and licensing](https://docs.overturemaps.org/guides/buildings/).

The existing CampusShield import RPC currently accepts only numeric OpenStreetMap way IDs and OpenStreetMap way URLs, even though the building table already lists `overture` as a possible provider value. It therefore cannot safely ingest Overture IDs today. A separate provider adapter is needed before importing Overture: validate the GERS ID and release, preserve source attribution/licence metadata, map outer footprints and building parts, and leave each record pending and unpublished. Do not send Overture IDs to the current OpenStreetMap-only RPC.

### Real building and campus models

For approved campus-supplied GLB models, keep MapLibre as the map renderer and use its supported custom 3D layer interface with Three.js `GLTFLoader`. The official MapLibre example demonstrates a model and 3D Tiles in a Three.js custom layer; its API also provides a supported path for adding custom renderers into the shared WebGL context. See [MapLibre's 3D Tiles, 3D objects and models example](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-3d-objects-and-models-using-threejs/) and [CustomLayerInterface](https://maplibre.org/maplibre-gl-js/docs/API/interfaces/CustomLayerInterface/).

A model must include placement metadata before it is placed on a geographic map: anchor longitude/latitude, altitude, heading, and model-unit scale (or an explicitly georeferenced coordinate system). The campus centre point alone is not sufficient to align a campus-wide GLB. Load an approved model only for the selected campus and only for a verified member who is allowed by the private Storage read policy; use a short-lived signed URL and lazy-load it only in 3D mode. Dispose of GPU resources when the mode changes or the map is removed. Never make the private GLB bucket public just to display a model.

The [Maptoolkit MapLibre 3D layers plugin](https://docs.maptoolkit.com/plugins/maplibre-3d-layers/) is a possible optional shortcut: it provides `Fill3DLayer` and `GltfLayer` and is MIT-licensed, but its own building tileset requires a Maptoolkit API key, and its GLTF layer does not support animations or Draco/KTX2-compressed models. It should be tested as an isolated prototype, not made a production dependency before checking performance, compatibility and key costs.

## 4. Decision for this release


- Keep MapLibre GL JS and custom CampusShield layers.
- Use configurable OpenFreeMap Liberty for staging only.
- Keep Esri imagery as an optional SAT/3D imagery layer under its own terms and attribution.
- For a commercial launch, compare MapTiler Flex and Stadia Starter using real tile counts in a staging load test, then request an SLA in writing if the map is relied on for safety workflows. If neither offer fits the budget/terms, plan a self-hosted PMTiles archive with monitoring and a tested fallback.
- Prioritise Babcock boundary and verified building-footprint data over a renderer replacement.

This evaluation does not create accounts, use a paid plan, register API keys, download bulk tiles, import any campus geometry or change production settings.
