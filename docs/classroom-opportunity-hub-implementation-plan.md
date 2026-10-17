# CampusShield AI — Classroom, Opportunity Hub, and Campus-Life Expansion

Status: implementation in progress on `codex/classroom-opportunity-hub`
Base: `feature/onboarding-staff-governance` (stacked on PR #14 → PR #13 → PR #8)
Environment: staging-first. No production database, site, or deployment changes.

## Repository inspection findings

The current feature branch already contains CampusPulse, campus-only groups and events, the campus marketplace, Helpdesk, verified campus noticeboard, moderation queues, university-scoped membership, and Supabase/RLS-backed backend helpers. Do not build duplicate versions of those modules.

The outstanding release audit says PR #8 has conflicts against `main`, PR #13 and PR #14 depend on earlier PRs, and signed-in staging browser acceptance/security review is incomplete. This branch must remain a feature branch and must not be merged or deployed to production as part of this work.

## Feature A — Teacher Classroom

### Intended first release
- A dedicated Classroom workspace for verified teachers/university staff and students in the same university.
- Verified staff can create a class with title, course code, course/programme, level, term/semester, and a short description.
- Class owners can create announcements and attach learning resources using approved, private storage.
- Students join only through a short-lived, revocable class invitation code or an explicitly approved join request. Never expose student lists or class resources to other universities.
- Staff-only management actions are hidden in the UI for students and are also denied by database policies/RPC authorization.
- Keep assignment submission and grades out of the first slice unless a separate privacy, retention, and authorization review is completed.

### Authorization requirements
- Require an authenticated, verified campus membership before reading class content.
- Require verified staff role in the same campus to create/manage classes.
- A teacher can manage only classes they own or are explicitly assigned to.
- Students can read resources only for classes they have joined and can never edit teacher-owned announcements.
- Derive user and university IDs from trusted auth/campus context on the server; never accept them as authoritative client input.
- RLS must be enabled on every new table. Use least-privilege grants and guarded RPCs where they are necessary. No service-role or secret keys in browser code.

## Feature B — Private Gift & Opportunity Hub

### Intended first release
- A campus-only discovery area for scholarships, internships, grants, competitions, hackathons, mentorship, student support, and gifts/free items.
- Keep opportunity listings distinct from the existing marketplace: marketplace is for buying/selling goods and services; this hub is for opportunities and no-cost/gift offers.
- Each listing includes category, title, description, eligibility, deadline (when applicable), provider/source, safe application/contact link, and moderation status.
- Listings are visible only to verified members of the same university after review. Support draft, pending review, published, rejected/expired, and archived states.
- Only authorized same-campus staff/moderators can publish, hide, or archive; owners can edit their own drafts and resubmit rejected items.
- Do not promise that opportunities are endorsed by the university unless a verified official publisher has confirmed that status. Label external opportunities as independently sourced and require users to verify before sharing sensitive data or paying fees.
- Do not expose personal contact details, identity documents, private drafts, or unpublished listings in public queries.

### Authorization and privacy requirements
- Enforce campus scope in RLS and every privileged RPC, not only in navigation or filters.
- Prevent cross-campus reads, edits, moderation, joins, and guessed-ID access.
- Restrict listing fields to the minimum needed for the feed; never return internal author IDs or private review notes to ordinary users.
- Validate external URLs and render them safely; no automatic scraping or claims that an opportunity is legitimate without source review.
- No payments, escrow, or collection of student identity documents in this feature.

## Feature C — Campus-life expansion

Most requested campus-life building blocks already exist in this branch: CampusPulse, groups, events/RSVPs, marketplace, Helpdesk, and verified noticeboard. First complete integration and acceptance testing rather than creating duplicates.

Potential additive improvements after the new feature foundations are stable:
- Cross-link relevant approved opportunities from CampusPulse, groups, and events without widening access beyond the user's campus.
- Add clear entry points and empty states for Classroom and the Opportunity Hub.
- Reuse existing campus identity, username privacy, moderation patterns, and design tokens.
- Keep the safety incident-reporting path clearly separate from Helpdesk, classroom and community features.

## Current implementation status (17 Oct 2026)

- Read-only inspection of staging (`hywcpnoqqhxvujnimhxl`) found existing classroom tables and guarded class create/join functions, but no `campus_opportunities` table. The migration chain was made idempotent, validated in a rollback-only PostgreSQL transaction, then applied to staging only. The recorded staging migration versions are `20261017202216`, `20261017202224`, `20261017202230`, `20261017202236`, and `20261017202242`.
- Ported the four idempotent classroom schema/access migrations from the existing classroom staging branch into this release stack (`20261017202216`–`20261017202236`) so a future clean environment can create the same classroom objects before hardening them. Added `supabase/migrations/20261017202242_classroom_opportunity_hub_security.sql` to tighten verified campus/role checks, restrict roster/attendance privacy, remove broad direct grants, and add the campus-scoped Opportunity Hub with RLS and guarded RPCs.
- Added backend methods in `campusshield-backend.js` for classroom reads/writes and Opportunity Hub operations. Database writes are routed through guarded RPCs.
- Added Teacher Classroom and Gift & Opportunity Hub pages/forms to `index.html`, including class join/create, announcements and resource links, opportunity drafts, submit-for-review, and staff review controls.
- Added `tests/classroom-opportunity-hub-smoke-check.mjs` and wired it into `.github/workflows/smoke-check.yml`.
- Local parse check performed through the GitHub source: both inline scripts and `campusshield-backend.js` parse successfully. Static assertions for the migration's main access controls passed. This is not a substitute for CI, PostgreSQL migration validation, or signed-in browser testing.
- Production remains untouched. Staging checks confirm RLS is enabled on classroom, attendance, and opportunity tables; anon/authenticated table-level INSERT/TRUNCATE privileges are absent; and the new RPCs are not executable by `anon`. A rollback-only staging authorization run passed 6/6 checks: verified teacher class creation/private code retrieval, student join and role restrictions, cross-campus join/read denial, student-own-attendance-only reads, private draft/pending opportunity isolation, and same-campus publication versus cross-campus denial. A post-check confirmed zero synthetic users, classes, opportunities, or attendance sessions remained. Signed-in browser walkthrough and UI interaction tests are still outstanding.

## Required implementation order

1. Resolve/inspect the stacked PR dependency and the current branch diff; do not merge anything.
2. Design and review schema/RLS for Classroom and Opportunity Hub before exposing any new table through the Data API.
3. Add migration(s) and backend helper methods with least-privilege grants, guarded authorization, and rollback notes. Apply only to the staging project after SQL review.
4. Add UI/navigation that is role-aware but never relies on UI visibility as authorization.
5. Extend smoke tests for role separation, university isolation, class membership, draft privacy, moderation, expired opportunities, and guessed IDs.
6. Run staging SQL checks and signed-in browser acceptance tests with fictional accounts and dummy files only.
7. Review Supabase Security Advisor findings individually and confirm the latest CI run.
8. Present test results and the release diff for owner approval. Only after staging gates pass and the owner explicitly confirms should production deployment be considered.

## Acceptance test matrix

- Pending/unverified student: cannot browse private hub listings or class resources.
- Verified student: sees only approved listings and resources for their own campus and joined classes.
- Verified teacher: can manage only their own/assigned classes; cannot manage another campus's content.
- Same-campus authorized moderator: can review and publish/reject pending listings.
- Different-campus student or staff: denied on reads, writes, RPCs, and guessed UUIDs.
- Listing owner: can edit own draft; cannot self-publish unless separately authorized.
- Expired/archived listing: absent from active feed; remains available only to authorized review/audit paths.
- Anonymous visitor: no access to private listings, classes, members, resources, or review notes.
- Regression: existing incident reporting, identity verification, CampusPulse, Helpdesk, noticeboard, groups, events, and marketplace policies continue to behave as before.

## Release boundary

This document is planning only. It does not apply migrations, change Supabase configuration, alter production, merge PRs, or publish/deploy the website.
