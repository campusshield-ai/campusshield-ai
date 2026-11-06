# CampusMap free GIS and cartography workflow

CampusShield CampusMap is a real-world university map. Use the free tools below for different parts of the workflow; do not use generated fantasy geography as campus source data.

## Recommended toolkit

| Tool | CampusMap job | Acceptable output |
|---|---|---|
| QGIS | Primary GIS workspace for reviewing campus boundary plans, georeferencing approved campus drawings, checking geometry, measuring footprints and preparing map data | GeoPackage working file; reviewed GeoJSON export |
| Inkscape | Design consistent vector map symbols, accessible legend artwork and explanatory diagrams | SVG icon assets |
| GIMP | Prepare university-supplied aerial/reference images and documentation thumbnails | Optimised PNG/JPEG reference images |
| Azgaar's Fantasy Map Generator | Inspiration for cartographic hierarchy, layer organisation, labels and visual storytelling only | No campus coordinates or production geometry |

GIMP, Inkscape and QGIS are free/open-source. Azgaar is a browser-based worldbuilding tool: use it as visual inspiration, never as a source of real university geography.

## Safe campus-data workflow

1. Obtain an official campus plan, survey, university GIS file or other authoritative source. Record who supplied it, its date, its licence/permission and what it actually establishes.
2. In QGIS, keep the original source unchanged. Work in a GeoPackage project and record the source CRS. Georeference scanned plans only against trustworthy control points; document the residual error and do not describe an approximate georeference as a land survey.
3. Validate the campus boundary and each building footprint separately. Confirm polygon closure, coordinate reference system, topology, campus identity and source evidence. Separate Main Campus from satellite campuses such as Iperu.
4. Export only the relevant reviewed geometry as GeoJSON in WGS 84 longitude/latitude (EPSG:4326) for the CampusShield boundary intake. CampusMap accepts one Polygon or MultiPolygon for a boundary file; dissolve legitimate multipart boundary features before import.
5. Loading a GeoJSON file in CampusMap creates an unpublished local candidate only. It does not verify or publish the boundary. A verified campus administrator must attach an HTTPS evidence source, compare the geometry to the official source and complete the existing review workflow.
6. Use Inkscape SVG assets for visual symbols—not as a substitute for coordinate geometry. Keep icon design consistent, legible, colour-independent where possible and accompanied by text labels.
7. Use GIMP only to prepare reference images supplied or licensed for the university. Keep imagery source attribution and capture date visible where applicable.

## Confidence and publication rules

- University-approved and surveyed geometry can be considered for the verified campus layer only after the review process records evidence.
- Community-mapped OpenStreetMap footprints remain candidates until exact on-campus positions and shapes are checked.
- A regional/state centroid is an orientation fallback, never a university entrance or campus pin.
- A scanned plan that has been georeferenced approximately must retain that uncertainty.
- Fantasy-map generator exports, decorative illustrations and hand-drawn diagrams must never be imported as campus boundaries, buildings, roads or emergency routes.
- Never draw connecting roads, paths, accessible routes, entrances or emergency routes when the underlying geometry has not been sourced and reviewed.

## Cartographic presentation principles

CampusMap uses separate controls for campus locations, campus boundary, building footprints, roads and footpaths, labels and administrator-only draft pins. Prefer clear hierarchy: primary roads should be visually stronger than local access roads; mapped footpaths can use dashed lines; verified boundaries should be solid while candidates remain dashed and amber; pending admin pins must never appear to ordinary students.

Map layers are a presentation preference stored locally in the browser. They do not change database records, publication status, user permissions or the underlying geographic evidence.
