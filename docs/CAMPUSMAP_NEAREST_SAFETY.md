# CampusMap nearby safety facilities

CampusMap can show the nearest published safety-related facilities for the currently selected campus after a user explicitly requests a location search.

## Included facility types

- Security posts
- Medical services
- Campus gates
- Assembly points
- Emergency points

The finder ranks only the selected campus's existing published feature records with valid latitude and longitude values. It excludes unpublished/admin draft records, unrelated facility types and records without usable coordinates. It never infers a missing point or pulls results from another campus.

## How it works

1. The user taps **Find nearby safety**.
2. The browser asks for location permission and obtains a device position.
3. A local Haversine calculation ranks eligible current-campus records by straight-line distance.
4. Up to six nearest results are shown. Selecting a result opens its existing Campus Passport and focuses the matching map marker.

Distances are straight-line estimates, not walking distances, travel times, or proof that a facility is open or staffed. Use the existing walking directions after selecting a mapped result.

## Privacy and safety

- No location request happens until the user taps the finder.
- The calculation runs in the browser. This feature does not write GPS coordinates to Supabase, local storage or the CampusShield backend.
- A local map marker indicates the position while results are displayed. The Clear control removes results and the marker.
- Switching campuses clears the previous results and marker.
- Clearing results also invalidates any pending browser geolocation callback, so an old result cannot reappear after a campus switch or Clear action.
- The finder does not dispatch responders, contact campus security or replace official emergency procedures. In immediate danger, contact official campus security or local emergency services directly.

## Data requirements

Only published, coordinate-bearing facilities already returned by the current campus-scoped CampusMap data loader are eligible. OSM/Overture candidate footprints, pending records and admin drafts are never treated as published safety facilities. Each campus's coverage depends on its own reviewed records.

## Scope

This is a client-side helper, map result panel, styling and regression-test change. It creates or edits no campus records, coordinates, database schema, Storage, RLS policies or user data, and it is intended for Staging only.
