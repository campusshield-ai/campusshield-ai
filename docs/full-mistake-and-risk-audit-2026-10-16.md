# CampusShield AI — End-to-End Mistake and Risk Audit

Audit date: 2026-10-16  
Scope: current PR #14 branch and its stacked PR #13 / PR #8 dependencies, migrations, browser backend helpers, CI smoke checks, staging database policies, and recorded NUC directory reconciliation status.

## Executive result

**Not release-ready yet.** The review found and corrected two access-policy issues and one staff-document upload compatibility issue. Automated static smoke checks have passed on earlier commits, but the latest changes must finish CI. Signed-in browser acceptance tests and the remaining security configuration work are still required.

No production database migration, production deployment, PR merge, real student ID upload, or real test-account creation was performed as part of this audit. Database changes described below were applied to CampusShield AI staging only (`hywcpnoqqhxvujnimhxl`).

## Fixes made during this review

### 0. Broad client table privileges on `public.profiles` (critical)
The live staging privilege query found table-level grants to `anon` and `authenticated` that included INSERT/UPDATE/DELETE/TRUNCATE (RLS is not a substitute for removing unnecessary table privileges, and TRUNCATE is not row-filtered by RLS). Added migration `20261016236000_lock_profile_table_privileges.sql` and applied it to staging only. Verified after the change: anon has no profile table privileges; authenticated has SELECT only at table level plus UPDATE on `display_name` and `requested_role`; authenticated cannot INSERT/DELETE/TRUNCATE, and cannot update `role` or `verification_status`. Added a regression assertion to the smoke suite. Verified the staging grants after the migration. The combined latest smoke suite passed in [run #38907714152](https://github.com/campusshield-ai/campusshield-ai/actions/runs/38907714152). Treat this as a high-priority security correction.


### 1. Campus interaction reads were accidentally restricted
The earlier restrictive RLS policy used `FOR ALL`, which also filtered `SELECT`. This could block reads that existing read policies were intended to allow. Migration `20261016234000_limit_verified_interaction_policy_to_writes.sql` replaces it with separate restrictive `INSERT`, `UPDATE`, and `DELETE` policies for six interaction tables. Staging `pg_policies` inspection confirmed the write-only policy set.

### 2. Student compatibility / verification gating
The verified-campus helper was adjusted in `20261016235000_preserve_verified_student_interactions.sql` so verified student access is based on a verified profile and the existing active verified student campus role rather than requiring a duplicate identity-verification row for every legacy account. It does **not** grant access to pending/unverified memberships. Regression assertions were added; verify the resulting CI run before relying on them.

### 3. Staff document extension could disagree with MIME type
Staff upload paths previously preserved the user-supplied filename extension. A valid PDF named without a .pdf extension (or with a mismatched extension) could be rejected by extension-based Storage policy despite passing the client MIME check. The backend now derives `.pdf`, `.jpg`, or `.png` from the accepted MIME type and sanitizes only the base name. Static assertions were added; verify the latest CI run.

## Release blockers and outstanding risks

### P0/P1 — Signed-in browser acceptance not completed
No full signed-in staging walkthrough has been completed. Static tests parse JavaScript and assert source text; they do not prove real authentication, upload, signed URL, approval/rejection, cross-campus denial, resubmission, or role navigation works end to end. Use only fictional accounts and dummy files.

Runbook: [Staging acceptance checklist](https://github.com/campusshield-ai/campusshield-ai/blob/feature/onboarding-staff-governance/docs/staging-acceptance-checklist.md)  
Results template: [Staging test results template](https://github.com/campusshield-ai/campusshield-ai/blob/feature/onboarding-staff-governance/docs/staging-test-results-template.md)

### P1 — Supabase Security Advisor warnings
Staging reports 44 `authenticated_security_definer_function_executable` warnings. This lint is not proof that all 44 functions are exploitable: some are intentionally callable guarded RPCs. However, each function must be inspected for caller authorization, university scope, input validation, locked search path, table grants, and correct execute grants. Do not blanket-revoke all functions because the app depends on legitimate RPCs.

Staging also reports `auth_leaked_password_protection` as disabled. Enable and test this in Supabase Auth settings before public launch:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The INFO `rls_enabled_no_policy` findings are `private.platform_admins` and `public.campus_identity_evidence_checks`. The evidence table intentionally has no direct client table grants and is accessed through guarded RPCs; verify privileges remain revoked. Review the private platform-admin registry's grants and trusted provisioning path rather than adding a broad policy.

### P1 — PR dependency chain is not ready to release
- PR #8 is open and GitHub currently reports it is not mergeable because of conflicts against `main`.
- PR #13 is open and based on PR #8.
- PR #14 is open/draft and based on PR #13.
- Do not merge #13 or #14 independently to `main`; resolve and review the dependency chain in order. PR #14's mergeable status against its feature base does not resolve PR #8's conflicts.

PRs: [#8](https://github.com/campusshield-ai/campusshield-ai/pull/8) · [#13](https://github.com/campusshield-ai/campusshield-ai/pull/13) · [#14](https://github.com/campusshield-ai/campusshield-ai/pull/14)

### P1/P2 — NUC university directory is not fully reconciled
The latest recorded reconciliation report says the roster has 328 active rows and one inactive alias (329 stored rows). It still lists 152 database names and 152 live NUC names without exact normalized-name matches, 144 fuzzy candidate pairs that are advisory only, and eight unmatched database rows plus eight unmatched NUC rows. The project notes require source review; do not automatically accept fuzzy matches or claim the directory is fully certified.

### P2 — Performance follow-up
The staging Performance Advisor reports 29 foreign keys without covering indexes and four indexes marked unused. These are performance recommendations, not necessarily correctness bugs. Review query patterns and existing indexes before adding/removing indexes; do not remove an index based only on a low-traffic staging snapshot.

### P2 — Browser upload / verification edge cases to test
- Staff uploads must clean up unreferenced files after an RPC failure; the staging policy appears designed to permit owner deletion of unreferenced uploads, but verify it with a deliberately rejected staging request.
- Confirm a staff application cannot be resubmitted while pending or approved; rejection must require a reason and permit resubmission.
- Confirm a student identity submission can be resubmitted only after rejection and that a failed resubmission does not delete the prior decision or leave a broken state.
- Confirm private documents are inaccessible by guessed object path and that signed URLs expire and are not logged/shared.
- Confirm official email, staff number, title, or a self-selected role never independently grants verified or admin permissions.
- Confirm profile self-update is restricted to the intended columns and that campus selection cannot be changed after onboarding.
- Confirm all community, Helpdesk, noticeboard, marketplace and moderation operations remain campus-scoped and pending users cannot bypass server-side checks.

## Automated checks and limitations

The smoke suite checks expected source text, migration patterns, and JavaScript syntax. It is useful regression protection but is not a SQL integration test and not a browser end-to-end test. Do not treat a passing smoke check as proof that every database function is secure.

The latest audit commit passed the combined smoke suite in [run #38907714152](https://github.com/campusshield-ai/campusshield-ai/actions/runs/38907714152), including assertions for profile table grants, the staff MIME-derived extension, and the verified-student helper.

## Required exit criteria

- [ ] Latest CI passes on the latest PR #14 head commit.
- [ ] Staging browser tests pass for registration, locked campus, private uploads, approval/rejection/resubmission, and cross-campus denials.
- [ ] Test role separation and trusted campus-admin appointment are verified.
- [ ] Every Security Advisor warning relevant to exposed RPCs has been reviewed individually.
- [ ] Leaked-password protection is enabled and verified.
- [ ] NUC unresolved rows/fuzzy candidates are source-reviewed or explicitly documented as unresolved.
- [ ] PR #8 merge conflicts are resolved and the whole stacked diff is reviewed.
- [ ] Project owner explicitly approves release.
- [ ] Production stays untouched until all release gates pass.

