# Babcock University map-data source inventory

**Prepared:** 2026-10-31  
**Campus:** Babcock University Main Campus, Ilishan-Remo, Ogun State  
**Purpose:** separate official evidence for place names from exact geometry/entrance evidence. This file is a research inventory; it does not publish or verify any map feature.

The project owner's screenshots of the [StudentHub campus map](https://www.studenthub.com.ng/map), including its 2D, satellite and 3D views, are catalogued separately in [BABCOCK_STUDENTHUB_REFERENCE.md](./BABCOCK_STUDENTHUB_REFERENCE.md). That inventory records screenshot-visible names and qualitative layout observations as unverified leads only; it also records the owner's preferred architectural visual direction. It does not supply coordinates, surveyed footprints, entrances or approved campus geometry.

## Verified official references for names and campus context

| Official reference | Information it supports | What it does not prove |
|---|---|---|
| [Babcock Contact](https://babcock.edu.ng/contact) | University address in Ilishan-Remo, Ogun State; official embedded campus locator. The iframe centre resolves to 6.8910932, 3.7191259. | A surveyed campus centre, campus boundary, building footprint, particular building entrance, or internal path. The current Staging profile correctly labels this as `official_locator`. |
| [OpenStreetMap university way 453068217](https://www.openstreetmap.org/way/453068217), surfaced through [Mapcarta's Babcock University map](https://mapcarta.com/Babcock_University_W453068217) | A second community-mapped Babcock University feature is listed at 6.88997, 3.72323. This is a candidate reference for a human to inspect in OSM; it is not the official university locator. | The search result does not establish the way's tags, full polygon geometry, campus-boundary role, survey accuracy, building edges or entrances. Do not use it as a verified centre or campus boundary without inspecting the original OSM object and comparing it with approved university evidence. |
| [Classic Halls](https://babcock.edu.ng/residence/classic) | Official hall names including Gideon Troopers, Winslow, Bethel Splendor, Samuel Akande, Felicia Adebisi Dada, Queen Esther, Platinum, Ameyo Adadevoh and Justice Deborah. | Individual hall polygons, entrance coordinates, heights or which outline corresponds to which name. |
| [Premium Halls](https://babcock.edu.ng/residence/premium) | Official hall names including Nelson Mandela, Welch, Havilah Gold and Crystal, with residence context. | Building geometry, survey measurements or exact location pins. |
| [Regular Halls](https://babcock.edu.ng/residence/regular) | Official names including Gamaliel, White, Nybergr, Ogden and Iperu Female Hall. | Whether a given footprint is the correct building or its entrance. |
| [Laz Otti Memorial Library](https://www.babcock.edu.ng/library) | Official library name, its main-campus role and the published description that it is opposite BUCODEL. The page also describes branch libraries. | A georeferenced library footprint, a boundary or door coordinates. |
| [New Students Information](https://babcock.edu.ng/new-students-info) | Official arrival flow references the University Gate, Registry, BUTH, Student Development, halls of residence and Amphitheatre; it also distinguishes Main Campus and Iperu Campus. | Coordinates for these stops or the exact route between them. |

The university contact page also links to its official Library, Facilities Management, Food Service, Sports Facilities, Student Support and Babcock University Teaching Hospital resources. These are useful further source candidates, but the linked service names alone must not be converted into map pins.

## Current Staging evidence

Read-only inspection of `campus_map_features` returned 22 Babcock location records. Read-only inspection of `campus_map_buildings` returned zero imported building footprints. The existing location records remain pending and unpublished. Several have community-mapped OpenStreetMap point candidates recorded separately from official name evidence; those point candidates are not footprints and are not proof of an entrance.

The Babcock Main Campus centre (6.8910932, 3.7191259) comes from the official contact-page map embed and is marked `official_locator`. Mapcarta separately lists OSM way 453068217 at (6.88997, 3.72323); because the original way geometry and tags have not been independently inspected against an approved plan, it remains a research lead only. The difference between these references is a reason to verify the chosen centre, not to choose one automatically. Babcock Iperu Campus has no sourced centre coordinates recorded. A centre for the whole campus must never be presented as a building or gate pin.

## Recommended matching and review workflow

1. Use official university pages to establish the canonical spelling and broad function of a facility.
2. Before importing building outlines, verify the exact campus-centre point against an approved university plan or on-campus survey. The official contact-page locator and OSM way 453068217 are reference leads, not a surveyed centre. Once the centre is verified, use OpenStreetMap Overpass to discover candidate building polygons; preserve the OSM way ID, source URL and ODbL attribution.
3. Match a candidate polygon to a facility name only when its position and footprint can be checked against a university site plan, a permitted survey, or a verified on-campus administrator's inspection.
4. Keep unknown matches labelled as unlabelled buildings. Do not transfer a nearby POI name onto a polygon merely because it is close.
5. Record exact entrance evidence separately from the polygon centroid. A building centroid is for map focus, not navigation to a doorway.
6. Imported candidates remain private, `pending`, and unpublished. Only a verified campus administrator can attach approved evidence and decide to verify/publish.
7. Do not draw emergency routes, accessible routes, pedestrian crossings or campus boundaries from guessed lines or points. Obtain mapped geometry and an approved source first.

## Geometry quality rules

The CampusMap import helper now:
- rejects any ring containing an invalid/out-of-range coordinate rather than silently dropping a point and corrupting the polygon;
- closes valid unclosed Overpass rings;
- rejects degenerate zero-area outlines;
- calculates an area-weighted local polygon centroid instead of averaging vertices (which biases the marker toward edges with more nodes);
- parses height and minimum-height tags consistently, converts feet to metres and rejects contradictory min-height values;
- accepts only integer floor-count tags rather than silently truncating values such as `4.5`.

Centroids do not become entrance locations. Tagged height, floor-count-based estimates and display-only fallback heights remain separate provenance classes.

## Publication boundary

This inventory does not insert or alter Supabase records. It does not set any Babcock feature to verified or published and does not change the university's source data. Current record visibility continues to be enforced by existing RLS and the verified-admin review RPC.
