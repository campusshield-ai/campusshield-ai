# CampusMap SVG symbol library

CampusShield AI uses a small, original SVG symbol set for published campus points. The library is local to the application; it does not fetch icon fonts, third-party SVGs, or imagery at runtime.

## Supported feature types

| Feature type | Map symbol | Category colour |
|---|---|---|
| security | Shield and check | Rose red |
| medical | Medical cross | Amber |
| library | Open book | Blue |
| hostel | Residence | Purple |
| cafeteria | Cup | Brown |
| lecture_hall | Graduation cap | Blue |
| building | Building outline | Green teal |
| gate | Gate bars | Teal |
| entrance | Directional doorway | Teal |
| parking | Parking mark | Slate |
| sports | Ball | Green |
| assembly_point | Target | Amber |
| accessible_entry | Wheelchair/accessibility mark | Green |
| emergency_point | Alert triangle | Red |
| location | Generic location pin fallback | Teal |

## Rendering and interaction

- The same SVG definition powers map markers and the verified-location list.
- MapLibre registers the SVGs as local style images and renders them in the `campus-feature-icons` symbol layer.
- The existing `campus-feature-points` circles remain underneath as a fallback and preserve a visible location target if a browser refuses an SVG data image.
- Clicking either the SVG marker or its fallback circle opens the existing Campus Passport record.
- The Layers control hides and shows the SVG markers together with the rest of the campus locations.
- The list icons are decorative and marked hidden from assistive technology; the containing location buttons retain their accessible names.
- SVGs use fixed, trusted paths and contain no external links, scripts, or user-provided markup.

## Data and accuracy boundary

This change is presentation-only. It does not add, alter, verify, publish, or move campus locations. A symbol identifies the *type of record*, not the precision or verification level of its coordinates. Existing university-scoped feature queries, review permissions, draft privacy, and evidence requirements remain unchanged.
