# Production forward-migration review

Date: 4 November 2026  
Repository: `campusshield-ai/campusshield-ai`

## Read-only schema findings

- Production has 62 public base tables; Staging has 85.
- 26 public tables exist only in Staging.
- Three public tables exist only in Production and must remain untouched: `campus_institutional_billing_requests`, `campus_opportunity_bookmarks`, `shieldmind_payment_orders`.
- Migration histories differ substantially: 50 Production entries versus 166 Staging entries. Do not replay the Staging migration directory as-is.
- Production's `incidents` table lacks `university_id`, `latitude` and `longitude`; Staging has them. The CampusMap candidate adds these as nullable fields, with a nullable university foreign key and no historical backfill.

## Role and identity compatibility

- Production's `private.current_user_can_use_restricted_features()` requires approved student identity for students.
- Production's `private.current_user_has_verified_campus_access()` delegates to that restricted-feature helper and also requires an active, verified campus membership.
- Staging's verified-campus helper is not equivalent and must not be copied into Production.
- Production's `private.current_campus_role()` returns the profile role; Staging's returns the campus-membership role. This package leaves Production's current helper unchanged.
- `campus_memberships.user_id` is the primary key, so the present schema supports at most one membership per user.
- Read-only account aggregates showed one verified admin with matching roles; one verified teacher profile whose membership remains unverified; three verified student profiles without memberships; and no student identity-verification rows in either database. This is not a full authenticated role test.

## Phase summaries

### CampusMap
The package includes the three CampusMap tables, campus profile management, verified map point management, building footprint review, Passport metadata validation, indexes and the draft-reader helper missing from Production.

The import workflow remains blocked until an administrator verifies an exact campus-centre point. Babcock's staged official locator is not a surveyed centre. The package excludes private GLB model submission, unverified OSM point seeding, extended Babcock candidate seed/update migrations and unrelated state-normalization updates.

### CampusPulse Phase 2
The package includes collaboration listings, event-buddy listings, mentorship profiles, memories, peer connection requests and social reports. It adds only the private `campus_member_blocks` dependency and helper needed by Phase 2 RLS. Direct anon/authenticated table access to member-block rows is revoked and blocked by a restrictive policy.

Stories, Anonymous Confessions, story media, Study Circles and Phase 3 profile/notification UI and RPCs remain excluded.

### Past Questions & Exam Prep
The package includes papers, items, separate reviewer-only answer keys, practice attempts and practice answers. The PDF bucket remains private; an existing bucket with different configuration causes the candidate to stop rather than overwrite it. The coverage RPC is authenticated-only. The existing Production identity-aware eligibility helper is retained.

The `past-question-practice` Edge Function is a separate deployment task.

## Production-only and existing data protection

The candidate does not modify the three Production-only billing/payment tables, Paystack functions, existing identity records or existing incident records. New incident fields are nullable and intentionally left unpopulated.

## Cost decision

No temporary Supabase branch was created. The quoted temporary branch compute was $0.01344/hour, and the user chose to continue with cost-free offline preparation.

## Remaining gates

1. Run the read-only preflight against current Production immediately before any isolated test.
2. Test the phases in order on an isolated DB derived from the Production schema.
3. Run postflight assertions and inspect RLS, grants, function ACLs and storage policies.
4. Complete authenticated role and cross-campus isolation tests with synthetic data.
5. Test the Past Questions Edge Function separately.
6. Only after every gate passes should PR #171 be considered for Production promotion.

No Production or Staging database writes were performed during this review.
