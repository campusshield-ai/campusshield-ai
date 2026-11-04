# Production forward-migration review package

**Review artefacts only. Not approved for execution.**

These SQL files are deliberately outside `supabase/migrations/`, so normal Supabase migration pushes do not apply them.

## Phases
1. `20261104_campusmap_forward_candidate.sql` — CampusMap's three tables, verified-map functions/policies and nullable incident-map columns. Existing incident rows are not backfilled.
2. `20261104_campuspulse_phase2_forward_candidate.sql` — six Phase 2 social tables plus the minimal private member-block table/helper required by Phase 2 RLS.
3. `20261104_past_questions_forward_candidate.sql` — five Past Questions/practice tables, a private PDF bucket, authenticated coverage RPC and the minimal server-only `service_role` grants required by the Past Questions Edge Function.

## Validation sequence
1. Run `20261104_production_preflight.sql` read-only and compare the result with the current Production schema.
2. Apply the three phases in order on a disposable database based on the Production schema.
3. Run `20261104_production_postflight.sql`; it checks RLS, explicit Data API grants, server-role grants and preservation of Production-only billing/payment tables.
4. Run authenticated student, teacher, security, admin, unverified-member and cross-campus isolation tests using synthetic accounts.
5. Validate the Past Questions Edge Function separately.

## Explicit exclusions
No Production-only payment/billing tables, Paystack functions, existing payment records, identity records, incident rows, Stories, Anonymous Confessions, Study Circles, media scanner workflow, Phase 3 profile/notification UI, private GLB model uploads, or OSM point seeding are included.

## Identity and role safeguard
The candidate retains Production's existing `private.current_user_can_use_restricted_features()` and `private.current_user_has_verified_campus_access()`. It does not replace them with Staging's less restrictive helper definition.

## Data API exposure

Supabase's explicit-grant cutover for new `public` tables took effect on existing projects on 30 October 2026. Each client-accessible table has explicit role grants in the candidate; private tables remain ungranted to `anon`. The Past Questions `service_role` privileges are limited to the server-side operations used by `past-question-practice` and must never be exposed in browser code.

## What this package proves
It provides a source-level review and static safety checks. It **does not prove that PostgreSQL will execute the migration successfully** or that live authenticated role isolation works. Those require an isolated database test.

No Supabase branch was created and no database writes were performed while preparing this package.
