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

## Current blockers

- No signed-in browser acceptance evidence for the complete candidate.
- Paystack lifecycle acceptance is incomplete.
- Identity scanner gateway/secrets and synthetic malware test results need confirmation.
- Production has no Edge Functions currently listed; the candidate's backend-dependent frontend cannot be published alone.
- Production/staging migration histories differ substantially; a table-level catalog diff is not a full schema diff.
- Security Advisor warnings require contextual review before release.

## Safety boundary

This document is a release plan, not a migration and not authorization to deploy. No production schema, function, secret, or application configuration is changed by adding this document.
