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
