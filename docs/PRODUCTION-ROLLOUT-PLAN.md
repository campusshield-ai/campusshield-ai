# Production rollout plan — CampusShield AI

**Status: NOT APPROVED FOR PRODUCTION DEPLOYMENT**  
**Prepared:** 2026-10-23  
**Production Supabase project:** `fvgtnujjnvdkhzqqcaqe`  
**Staging Supabase project:** `hywcpnoqqhxvujnimhxl`  
**Candidate:** `codex/campusshield-release-prep` (PR #33)

## Live inspection findings

Read-only inspection of the database catalog found:

- Production has 7 base tables in `public`: `profiles`, `incidents`, `community_profiles`, `community_posts`, `community_comments`, `community_reports`, and `student_identity_verifications`.
- Staging has the expanded campus-life, classroom, knowledge, planner, identity-scan, and subscription schema, plus server-only tables in `private`.
- The migration history currently lists 14 entries in production and 95 in staging. The histories are not a simple prefix/suffix of each other: migration versions and names differ, and staging contains duplicate logical migration names at different versions.
- Staging has active Edge Functions for ShieldMind chat, billing checkout, Paystack webhook, campus knowledge crawling, and identity upload scanning. The production project currently lists no Edge Functions.

These differences mean the candidate migration folder must **not** be replayed wholesale on production. A successful frontend smoke check is not proof that database or billing deployment is safe.

## Eight platform milestones and acceptance gates

The candidate should be reviewed against these feature areas as one integrated campus platform. Existing implementation in the draft branch is not considered released until the checks below pass.

1. **App shell and onboarding:** responsive desktop/mobile navigation, accessible controls, institution directory search, verified profile context, and clear prototype/demo labels. Check keyboard navigation, narrow-screen layout, sign-in/sign-up validation, and loading/error states.
2. **Incident reporting and management:** authenticated report creation, role-gated status changes, searchable cases, risk triage, and any evidence upload through a private, validated storage path. Confirm students cannot read or resolve other users' restricted cases and that triage is presented as guidance, not a validated prediction.
3. **Safety dashboard and analytics:** dashboard totals must derive from rows the signed-in user is authorized to see; exports must not bypass RLS or include hidden campus data. Verify CSV output with synthetic records.
4. **Identity verification:** private document storage, owner-only upload path, authorized same-campus review, rejection/resubmission, and server-side file scanning/quarantine. Use synthetic files only; never use real student ID cards in tests.
5. **ShieldMind AI:** server-side provider credentials, verified-user eligibility, server-enforced quota and cooldown rules, approved-source grounding only, and no private incidents, identity documents, attendance, or private helpdesk content in prompts. Do not describe generated answers as official campus policy without approved source material.
6. **CampusPulse community:** username-based public identity, same-campus scoping, safe media access, comments/replies/reactions/polls, user reports, and staff moderation. Test peer and cross-campus access denials.
7. **Campus services:** same-campus groups and events, helpdesk ticket references/status history, and verified staff notices with audience scope and expiry. Confirm students cannot impersonate staff or edit staff-only ticket updates.
8. **Members, roles, and university isolation:** role assignments must come from verified server-side records, not form hints or client-side controls. Test pending/rejected identities, student/teacher/security/campus-admin roles, platform-admin provisioning, and cross-campus isolation across every feature.

## Required release sequence

### 1. Freeze and identify the candidate
- Record the exact reviewed candidate commit SHA.
- Run every repository smoke test against that SHA and retain the Actions result.
- Do not merge stacked draft PRs merely to make the release green.

### 2. Reconcile database schema
- Export/read the production schema and compare it to the candidate migrations and staging schema.
- Map each intended schema object to the actual production state; account for already-applied changes even when migration versions differ.
- Build a reviewed, forward-only migration sequence with explicit dependencies and preconditions.
- Preserve all existing profiles, incidents, community content, identity-verification records, grants, RLS policies, and private storage protections.
- Use a production backup/restore plan and a tested rollback or forward-fix plan.
- Do not apply any migration until the final SQL has been tested on a production-like staging clone or equivalent disposable database.

### 3. Validate backend prerequisites
- Identify every production Edge Function required by the released frontend and deploy from the reviewed candidate source, not from ad hoc snippets.
- Configure provider credentials only through Supabase secrets. Never put AI provider, Paystack secret, service-role, or scanner tokens in browser code or commits.
- Verify required secrets are present without printing their values.
- Keep JWT verification enabled for user-facing functions. The Paystack webhook may have JWT verification disabled only because it validates Paystack signatures and verifies transactions server-side.

### 4. Complete staging acceptance
- Signed-in synthetic student, teacher, and campus-admin flows; pending/rejected identity gates.
- Cross-campus RLS isolation for community, Helpdesk, notices, classes, planner, and knowledge.
- ShieldMind grounding against approved public campus sources; verify private incidents, identity documents, attendance, and private Helpdesk content are never passed to prompts.
- Identity upload scanning with synthetic safe files, EICAR test file, scanner unavailable/timeout, quarantine and resubmission.
- Paystack test mode: valid/invalid signatures, successful/failed/cancelled payments, transaction verification, duplicate webhook idempotency, renewal/expiry, entitlement revocation, and quotas.
- Review Security Advisor findings, including RLS-enabled tables without policies and callable SECURITY DEFINER functions. Private-only tables without policies may be intentional, but grants and access paths must be verified individually.

### 5. Production release
- Only after the checks above pass: approve/merge the release PR, apply the reviewed migration sequence, deploy functions and secrets, and publish the matching frontend commit.
- Verify sign-in, existing incident creation/read/update permissions, identity protections, core campus features, and monitoring after release.
- Keep billing entitlements disabled until a verified server-side payment event grants them.
- If a critical check fails, stop and leave production unchanged.

## Latest staging security audit — 2026-10-23

A fresh read-only Supabase Security Advisor review flagged the following items on staging project `hywcpnoqqhxvujnimhxl`:

- **Critical: RLS disabled on two private tables:** `private.shieldmind_session_windows` and `private.shieldmind_image_usage_windows`. The advisor supplies this proposed SQL:
  ```sql
  ALTER TABLE "private"."shieldmind_session_windows" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "private"."shieldmind_image_usage_windows" ENABLE ROW LEVEL SECURITY;
  ```
  **Do not run this snippet by itself.** Enabling RLS without policies can block legitimate server-side access, and these tables support usage enforcement. First verify schema exposure, grants, all function access paths, and whether service-role-only policies are required. Apply a reviewed fix only after the intended access model is confirmed.
- **RLS enabled with no policies on five tables:** `private.paystack_billing_event_receipts`, `private.platform_admins`, `private.shieldmind_billing_intents`, `private.shieldmind_usage_windows`, and `public.campus_identity_evidence_checks`. Treat these individually; do not create broad client policies merely to silence the advisor.
- **67 SECURITY DEFINER functions callable by authenticated users** are flagged. These functions must be reviewed individually for explicit caller checks, safe `search_path`, least-privilege grants, and campus/owner boundaries. Do not blanket-revoke them because some are intended guarded RPC entry points.
- Performance findings include foreign-key indexes not yet used by observed traffic, unused indexes, and one RLS policy initialization-plan warning. Review with query plans and expected workload before changing indexes.

This audit was read-only. No staging schema, secret, function, or production setting was changed by recording these findings.

## Current blockers

- No signed-in browser acceptance evidence for the complete candidate.
- Paystack lifecycle acceptance is incomplete.
- Identity scanner gateway/secrets and synthetic malware test results need confirmation.
- Production has no Edge Functions currently listed; the candidate's backend-dependent frontend cannot be published alone.
- Production/staging migration histories differ substantially; a table-level catalog diff is not a full schema diff.
- The latest staging security findings above need owner-reviewed remediation and verification.
- Security Advisor warnings require contextual review before release.

## Safety boundary

This document is a release plan, not a migration and not authorization to deploy. No production schema, function, secret, or application configuration is changed by this document.
