# CampusMap facility discovery and search

CampusMap's facility directory combines broad task categories with exact facility-type filters. Both operate on the published, coordinate-bearing records for the currently selected campus.

## Discovery controls

The broad categories remain:

- All
- Academic
- Residential
- Services
- Access
- Emergency

A second, data-driven row adds exact types such as Buildings, Lecture halls, Hostels, Libraries, Cafeterias, Medical services, Security posts, Gates, Parking, Sports facilities, Other facilities, Assembly points, Entrances, Accessible entrances and Emergency points. Only types that have a published mapped record in the selected campus are shown. Each chip includes its current record count.

The visible list and map markers are filtered together. Clearing filters restores the full published campus directory and all its markers. Switching campuses resets the filter state so a choice from one campus cannot accidentally hide categories on another campus.

## Search matching

Search is case-insensitive, accent-normalised, supports multiple words, and includes published Passport descriptions and metadata such as building codes, opening hours, facilities, accessibility features and contact labels.

Examples of common alternatives:
- clinic, hospital or first aid -> Medical services
- canteen or food court -> Cafeteria
- dormitory or hall of residence -> Hostel
- classroom, lecture theatre or auditorium -> Lecture hall
- car park -> Parking
- wheelchair access, ramp or step-free access -> Accessible entrance

Search still requires all words in a multi-word query to match the combined record text. A matching result can be opened through the existing Campus Passport.

## Privacy and data boundaries

- Counts and type chips use the existing selected-campus records where `is_published = true` and latitude and longitude are present.
- The browser does not create facility records or infer missing campus locations.
- Unpublished records remain excluded from ordinary student search and counts.
- Verified campus administrators can still search their own private drafts through the existing admin-only path; drafts are not included in public counts or public type chips.
- No Supabase schema, data, storage, role, or RLS changes are part of this feature.
