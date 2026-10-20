# CampusShield AI Release Preparation Checklist

Status: **Draft release candidate — not approved for production**

This branch is based on `codex/campusshield-all-ideas-staging` (commit `bc244369e936a4d45b5efd2db8984431ac355abe`). It is a review branch only. Do not merge or deploy until the owner approves the exact final diff.

## Included feature sources

- ShieldMind AI academic Q&A and protected Supabase Edge Function source.
- Study planner and reminder support with owner-scoped RPCs.
- Staging-only subscription/Paystack checkout and webhook source.
- Login/account refresh, campus dashboard, classroom/opportunity hub, and existing campus features.
- Required migration files, setup documentation, and smoke tests present on the staging feature branch.
- Browser configuration selects staging for development/preview hosts and production only on the configured production hostname.

## Release blockers to resolve

1. **Student identity UI is updated on this release-prep branch.** The standalone workspace page/sidebar route is removed. Student ID uploads during signup when Supabase returns an authenticated session; if email confirmation is required, the user signs in and uses the dashboard's Complete student setup action, opening the same Create account/setup view. Existing private upload helper, campus matching, admin review/rejection/resubmission and RLS checks remain. GitHub Actions passed on commit `8f2ef381016f04c7ff71e00c8fd55863ae6c782d` (all configured smoke checks succeeded). A real staging browser test is still required.
2. **Student access needs a signed-in browser walkthrough.** The frontend no longer redirects students to a separate identity page or hides the workspace solely because identity is pending. Protected operations and ShieldMind actions remain subject to server-side authorization/RLS.
3. **ShieldMind provider setup and browser acceptance remain outstanding.** Confirm the provider secret exists only in staging Edge Function secrets; use fictional student accounts and academic-only sample questions/images. Test access gates, privacy, quotas, and error handling.
4. **Payments are not launch-ready.** Paystack test secret/webhook setup and payment acceptance tests (successful, rejected, duplicate webhook, expiry, quota enforcement) remain outstanding. Do not represent paid checkout as verified until these pass.
5. **Official university answers are not source-grounded yet.** Do not market AI responses as official policy; an approved campus source catalog is still required.
6. **Staging browser tests are required.** Test login/sign-up, account roles, campus boundaries, student identity submission/review, ShieldMind chat and image limits, planner cross-account isolation, classroom access, and the complete student workspace.
7. The configured GitHub Actions smoke-check job passed on the identity-fix commit. Review the complete release diff and all migration diffs before any production release. Never apply staging migrations to production automatically.


## Google sign-in — staging progress (2026-10-20)

- **Owner reports setup completed:** Google sign-in is enabled in Supabase Staging, the owner's Google account has been added as an OAuth test user, and the local redirect allowlist pattern `http://127.0.0.1:5500/**` has been added under **Authentication → URL Configuration → Redirect URLs** and saved. The account email is intentionally not recorded in the repository.
- This setup is **not independently verified here** because no screenshot or browser test result has been provided in this conversation. Do not treat OAuth acceptance as passed yet.
- **Next test:** open the local Live Server preview at `http://127.0.0.1:5500`, click Google sign-in, choose the approved test account, and confirm that the browser returns to CampusShield with a valid signed-in session. Check that a new Google account remains a pending student and that OAuth role/institution hints do not grant privileges.
- If sign-in fails, capture the exact on-screen error and a screenshot of the staging URL Configuration page; redact email addresses, tokens, client secrets and other credentials before sharing.
- Use staging only. Do not change production Auth settings. Do not put the Google account email, OAuth client secret, or other credentials in GitHub or chat.

## Migration-history reconciliation blocker

A read-only comparison on 2026-10-20 found that the staging Supabase ledger has **87 applied migration entries**, while the release snapshot contains **66** files under `supabase/migrations`. Of those source files, **45 names appear in the staging ledger under different version timestamps**, **3 source migration names are not in the staging ledger**, and **20 applied staging migration names do not exist in the release snapshot**.

This indicates migration-history drift between repository timestamps/content and the staging ledger. It does not by itself prove that the database schema is incorrect, because migrations may have been applied under earlier timestamps or through a different staging path. However, it is **not safe to treat the repository's migration folder as a directly replayable production migration plan**. Before release, create a migration reconciliation map against the intended production schema/history, confirm which DDL is already present, then prepare a reviewed forward-only migration plan. Do not auto-apply, renumber, reset, or roll back any migration as part of this release-prep work.

## Staging security and performance advisories

The staging Security Advisor currently reports:
- 67 `SECURITY DEFINER` functions executable by authenticated users. Some are intended guarded RPCs (the reviewed quota functions check the authenticated caller and eligibility); each exposed privileged function still requires owner/authorization review.
- Leaked-password protection is disabled in Supabase Auth. Enable and verify this before production launch.
- Three RLS-enabled tables have no policies: `private.platform_admins`, `private.shieldmind_usage_windows`, and `public.campus_identity_evidence_checks`. The private tables and public evidence table appear intended to be inaccessible directly, but confirm the deny-by-default access model before launch. No policies were changed automatically.

Performance Advisor also reports 41 unindexed foreign keys, one RLS initialization-plan warning, and 10 unused indexes. Treat these as tracked review items; do not make broad index or permission changes without workload/security validation.

Links:
- [SECURITY DEFINER functions executable by authenticated users](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)

The latest flattened release commit passed all configured GitHub smoke-check scripts. A signed-in staging browser walkthrough is still required; successful smoke checks do not prove live AI-provider or Paystack configuration.

## Safety boundary

- No production Supabase migration or configuration change is authorized by this branch.
- Do not expose service-role keys, AI provider secrets, or Paystack secret keys in browser code or Git.
- Keep student ID cards, incident reports, private Helpdesk data, and real personal data out of tests.
- This branch and its draft pull request are for review only; no merge, live deployment, or payment activation is authorized.


## Navigation and institution search update (2026-10-20)

- Added a desktop sidebar collapse/expand control with an icon-rail layout and a remembered local preference; mobile uses a slide-in drawer, backdrop, Escape-to-close, and a visible menu button. Navigation entries and existing role checks remain in place.
- Added live institution name suggestions backed by the active campus directory already loaded by the app. Choosing an exact institution maps back to its existing university record ID; typing a name alone does not create membership or grant permissions.
- The owner reports Google/Gmail sign-in now works in their browser. This is owner-reported acceptance and has not been independently reproduced here. Continue to ensure OAuth hints never grant role or campus privileges.
- The UI changes are on the release-prep branch for review only. Re-run configured smoke checks and do a signed-in desktop/mobile browser walkthrough before merge or release. No production Supabase settings were changed.


## Sidebar logo and interaction polish (2026-10-20)

- Added `assets/campusshield-logo.svg`, a lightweight custom shield mark using CampusShield's mint/teal and deep-navy palette. The sidebar now displays the logo before the brand name; the collapse control sits below the brand instead of above it.
- Refined sidebar spacing, scrolling, icon sizing, focus states, collapsed icon rail, accessible labels/tooltips and mobile drawer behavior. Desktop collapse and mobile drawer remain separate modes.
- Smoke checks now assert the logo asset reference, accessible logo label, brand/control order and accessible icon labels.
- Browser visual QA across desktop and mobile plus CI confirmation are still required. These commits remain on the draft release-prep branch; no deployment or production Supabase changes were made.


## Institution search and sign-in fix (2026-10-20)

- Fixed the sign-in institution hint: it now has its own live suggestions list backed by the full university directory loaded by `listCampusUniversities()`. Partial names, accents and multi-word prefixes are normalized for matching. This hint remains optional and does not change verified campus membership.
- Signup suggestions use the same directory; selecting an exact institution maps to its existing directory ID. All matching records are considered rather than truncating results to the first 40. The staging migration snapshot documents a 328-entry NUC-sourced roster; verify the live staging directory contents against the current NUC directory before launch.
- Hardened auth mode validation so hidden signup-only required fields cannot block sign-in, made the sign-in button explicitly submit the form, and added a useful validation message for invalid fields.
- The latest changes are committed on the review branch. CI and browser acceptance still need confirmation; no production Supabase settings were changed.


## Student identity upload usability and authenticity notice (2026-10-20)

- The student-facing form now asks users to select a JPG, PNG, or PDF (maximum 5 MiB); it no longer asks them to enter or choose a storage path. The browser helper generates a random UUID filename and places it under the authenticated user's private storage folder.
- The form requires an explicit confirmation that the document is genuine and has not been AI-generated or digitally altered. This is an attestation and a review signal, **not** an AI-image detector; reviewers must continue to assess evidence and can reject suspicious or unverifiable documents.
- Uploads remain limited to JPEG, PNG, and PDF, use the private `student-identity-documents` bucket, and rely on Supabase RPC/RLS enforcement. No storage policy was weakened and no production changes were made.
- Before merging, run both `node tests/smoke-check.mjs` and `node tests/student-identity-smoke-check.mjs`, then test upload/rejection/resubmission in staging with fictional test files. Confirm that the currently deployed staging RPC and Storage policies accept UUID filenames in the user's folder; do not apply or replay migrations against production.


## Staging identity upload validation (2026-10-20, follow-up)

- Confirmed the staging project is active and healthy.
- Applied forward-only migration `allow_uuid_student_identity_uploads` to staging project `hywcpnoqqhxvujnimhxl`. Read-back checks confirm the identity bucket is private, is limited to 5 MiB and JPEG/PNG/PDF, and has an INSERT policy requiring the authenticated user's own UUID folder plus pending student status and active campus membership. The identity submission RPC is executable by authenticated users, not anon.
- Read-back count: 329 active campus directory records. The identity verification table currently has zero rows; no synthetic or real ID document was uploaded by this database-only verification.
- The GitHub smoke-check workflow run #640 passed.
- End-to-end upload/review remains unverified until a signed-in staging browser test can upload a harmless synthetic sample file. Automated checks do not prove the no-AI attestation is truthful; reviewers still need to review submitted evidence. Production remains unchanged.
