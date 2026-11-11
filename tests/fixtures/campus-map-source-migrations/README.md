# CampusMap source migration fixtures

These SQL files are copied from the Staging history solely as inputs to `tests/campus-map-smoke.mjs` static source assertions. They are not active Supabase migrations and must never be moved into `supabase/migrations/` or applied. Production already received the separately reviewed forward-only CampusMap Phase 1 migration recorded as `campusmap_production_phase1_forward`.
