# CampusShield AI campus-life rollout

This branch contains a rollout plan distilled from the Base44 screenshots. It is documentation-first: no live site or production database has been modified.

## What we confirmed
- Existing live website: https://campusshield-ai.github.io/campusshield-ai/
- Existing repo: https://github.com/campusshield-ai/campusshield-ai (default branch main).
- Production Supabase project: fvgtnujjnvdkhzqqcaqe; staging: hywcpnoqqhxvujnimhxl.
- Existing source includes a substantial HTML/CSS/JS application and a Supabase configuration pointing at production. Do not swap this to Base44's database without an explicit architecture decision.
- Existing icon at icons/campusshield.svg is present. Preserve it and other legacy assets; don't silently substitute the Base44 orange shield.
- Staging already has RLS-enabled schema objects for incidents, profiles, CampusPulse/community, campuses/memberships, groups, events, helpdesk, notices, opportunities, classrooms, identity verification, and ShieldMind. Inspect and reuse these models before adding anything.

## Desired UX from supplied Base44 references
1. Overview dashboard with permitted incident metrics, triage queue, announcements, academic deadlines and CampusPulse highlights.
2. Sign in/create account and password recovery.
3. Incident reporting: campus, category, title, description, location, date/time, optional parties/evidence, privacy/anonymity option, emergency disclaimer.
4. Incident queue with filters and authorized case management.
5. CampusPulse: feed, questions, polls, bookmarks, comments/replies, reactions, reports and moderation.
6. Verified announcements, events, academic tools, campus services directory, helpdesk, opportunities, analytics and CSV export.
7. Campus AI assistant limited to approved sources and records the signed-in person may read.
8. Administration: identity/role review, moderation, campuses, audit history and service directories.
9. Profile, account-verification state, notification view and privacy-aware account settings.

## Ordered implementation
- P0: Compare existing legacy pages against Base44 references; fix dashboard heading contrast, responsive layout and navigation consistency; reuse real logo and favicon.
- P0: Verify authentication/recovery, incident submission/listing/status transitions, profile state, account verification, and role-gated pages.
- P1: Reuse current community, campus, group, event, helpdesk, notice, opportunity, classroom and identity models; avoid duplicate tables.
- P1: Make dashboard counts and announcements derive from actual RLS-filtered data. Never display fixture values as real; show honest empty states.
- P2: Complete groups/events/RSVPs, helpdesk tickets/updates, verified opportunities/notices and academic planning using existing secure models.
- P2: Keep AI limited to approved sources and authorized records; represent uncertainty and never claim emergency dispatch.
- P3: Add permission-aware analytics, date filtering, CSV formula-injection protection, and tests.

## Security review requirement
The staging Security Advisor on 2026-10-23 reported callable SECURITY DEFINER functions in the public schema and tables with RLS enabled but no policies (including public.campus_identity_evidence_checks). This requires a function-by-function and table-by-table authorization review; do not blindly revoke functions or add broad policies. Keep private data behind least privilege and verify with synthetic accounts.

## Release process
- Keep this work on codex/campus-life-rollout-plan until reviewed.
- Any SQL change goes to staging only, with rollback/migration review and advisor checks.
- Any code change should be made on a feature branch, tested, and delivered as a PR; do not push directly to main.
- Do not modify production Supabase or the live site until changes and test evidence are reviewed.
- Report each acceptance check as PASS, FAIL, BLOCKED, or NOT RUN.

## Acceptance checks
- [ ] The original CampusShield logo/favicon remains.
- [ ] Dashboard headings have sufficient contrast in every state.
- [ ] All visible navigation actions work and respect roles.
- [ ] Real data and demo data are clearly distinguished.
- [ ] Account roles cannot be self-assigned and pending/rejected status cannot be bypassed.
- [ ] Incidents and evidence remain private and campus-scoped.
- [ ] Community, groups, events, helpdesk, opportunities and notices respect database policies and campus boundaries.
- [ ] AI respects authorization, approved source boundaries and emergency disclaimers.
- [ ] Analytics and exports respect access controls.
- [ ] No production DB changes; staging regression and advisor review completed.
