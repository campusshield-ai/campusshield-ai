# CampusMap nearby safety facilities

CampusMap can locate the nearest published safety-related facilities for the currently selected campus after a student explicitly requests a location search.

## Included facility types

- Security posts
- Medical services
- Campus gates
- Assembly points
- Emergency points

The finder ranks only the currently selected campus's existing published feature records with valid latitude and longitude values. It excludes unpublished/admin draft records, non-safety facility types, and records without usable coordinates. It does not infer a missing point or pull locations from another campus.

## How it works

1. The student taps **Find nearby safety**.
2. The browser asks for location permission and obtains a device position.
3. A local Haversine calculation ranks the eligible current-campus records by straight-line distance.
4. Up to six nearest results are shown. Selecting a result opens its existing Campus Passport and focuses the corresponding map marker.

The displayed distances are straight-line estimates, not walking-route distances, travel times, or proof that a facility is open or staffed. Students can use the existing walking directions after selecting a result.

## Privacy and safety

- No location request occurs until the student taps the finder.
- The calculation runs in the browser. The GPS position is not written to Supabase, stored in local storage, or sent to CampusShield's backend by this feature.
- A local map marker indicates the position while the results are displayed. The Clear control removes the results and this marker.
- Switching campuses clears the previous result set and local position marker.
- The feature does not dispatch responders, contact campus security, or replace official emergency procedures.

## Scope

This feature adds client-side ranking, a CampusMap result panel, styling, and regression tests. It does not create or edit campus facility records, change coordinates, alter Supabase schema or policies, or touch Production.
