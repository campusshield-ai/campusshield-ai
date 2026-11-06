# CampusMap route destinations

CampusMap walking directions choose a destination from the selected published campus location and its linked entrance records.

## Destination selection

- For a building or facility with linked entrance records, normal walking directions prefer a linked entrance marked `entry_type = main`, then another linked entrance, then a linked accessible entrance.
- Accessible directions require a linked `accessible_entry` marked `entry_type = accessible`. They do not fall back to an ordinary entrance or the building marker.
- Selecting an entrance directly routes to that entrance. An ordinary entrance cannot be used as an accessible route target.
- A building or facility marker is used as the normal-route fallback only when no separate linked entrance is recorded.

The Campus Passport displays the resolved normal and accessible destinations by name. After a route is calculated, the status message repeats the destination used and shows the approximate distance and routing-service duration when available.

## Coordinate and accessibility safeguards

- Route targets must have finite longitude and latitude values within WGS84 bounds. Missing, empty, or out-of-range coordinates are rejected before the request is sent.
- The public FOSSGIS foot-routing instance is addressed using its `/routed-foot/` service prefix. This selects the walking graph; the OSRM URL's profile segment remains `/driving/` for this hosted configuration.
- The route is an estimate based on mapped OpenStreetMap pedestrian data. A campus-approved accessible entrance marker does not certify that every segment of the calculated path is step-free, unobstructed, or currently open.
- Browser location is requested only when the user chooses directions. The start and destination coordinates are sent to the external FOSSGIS routing service to calculate the route; the operator says route requests are saved in its server logs. This feature does not store the live GPS position as a CampusShield or Supabase record.

## Scope

This change only updates client-side destination selection, validation, Passport details and smoke tests. It does not add or change campus coordinates, publish records, modify Supabase data or schema, change permissions, or touch Production.
