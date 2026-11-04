# CampusShield AI — Campus Life Rollout

## Purpose

This plan maps the useful Base44 design into the existing CampusShield AI app while preserving its current HTML/CSS/JavaScript frontend, Supabase architecture, verified access rules, and working functionality. It is a planning document, not a claim that UI features already exist in the production website.

## Source-of-truth principles

- Existing production website: https://campusshield-ai.github.io/campusshield-ai/
- Existing repository: campusshield-ai/campusshield-ai
- Production Supabase project: fvgtnujjnvdkhzqqcaqe — do not modify during this rollout.
- Staging Supabase project: hywcpnoqqhxvujnimhxl — use for any schema/backend tests.
- Stage changes in feature branches and review them with pull requests; do not push directly to main.
- Use the existing official logo asset `icons/campusshield.svg` and existing `index.html` branding. Do not substitute a generated placeholder logo.
- The repository already contains substantial campus-life, classroom, identity, opportunity, helpdesk, social feed, and ShieldMind-related database structures. Inspect these before proposing schema additions.
- Do not create duplicate tables or expose sensitive records to public users.

## Current Base44 design reference

The user supplied screenshots illustrating these page concepts:
- Dashboard overview with open incidents, resolved this month, announcements, verification queue, triage queue, deadlines and CampusPulse previews.
- Password reset and sign-in pages.
- Incident report form with campus, category, title, description, location, time, involved parties, optional private evidence, anonymity toggle, and warning that it does not dispatch emergency help.
- Incidents case queue with filters.
- CampusPulse with activity, questions, polls, bookmarks, and verified-member posting gates.
- Official announcements.
- Events and campus activities.
- Academic area with timetable, deadlines, courses, study groups, resources.
- Campus services directory.
- Helpdesk with new request, my requests and campus queue.
- Opportunity hub for internships, jobs, scholarships, volunteering and research.
- Analytics and CSV export.
- Campus AI assistant with clear limits.
- Admin control centre with verifications, moderation, campuses and audit log.
- Account verification, identity documents and profile settings.

These are visual/functional references. Their existence in Base44 does not prove that the same features are implemented or backed by data in the existing site.

## Prioritized implementation

### P0 — Baseline, identity, and safety
1. Capture main-branch baseline and preserve existing assets/workflows.
2. Fix dashboard heading contrast and improve visual consistency without replacing the existing brand.
3. Check navigation, responsive behavior, authentication/recovery, and role-aware routes.
4. Verify incident report submission, incident read scopes, and authorized status transitions.
5. Keep emergency warnings visible and accurate.
6. Verify admin/teacher/student roles against trusted backend claims; never trust browser-only role labels.

### P1 — Use existing campus-life backend
1. Inspect schema and RLS for existing groups, events, memberships, marketplace, community feed, notices, helpdesk, opportunities, classrooms and identity verification.
2. Connect existing pages to their current backed workflows instead of building duplicate tables.
3. Verify campus-specific isolation on every list, detail route, mutation, and export.
4. Ensure public service directory contains only intentionally public contact information.
5. Keep account and identity documents private.

### P2 — Academic and campus home
1. Add an integrated home dashboard with true, permission-filtered previews and links.
2. Use existing classroom/course/timetable structures where available.
3. Clearly distinguish personal reminders and sample content from official institutional records.
4. Do not fabricate grades, attendance, classes, deadlines, events, services, scholarships or analytics.
5. Only connect institutional systems after their provider and authorization setup are available.

### P3 — CampusPulse and events
1. Verify posts, questions, polls, comments/replies, reactions, bookmarks, reports, moderation, groups, events, memberships and RSVPs.
2. Keep public display names separate from private profile/contact details.
3. Gate restricted interactions using server-side policies and database checks.
4. Test cross-campus access and private group membership with synthetic users.

### P4 — Helpdesk, opportunities, and announcements
1. Connect helpdesk tickets, updates, campus notices and opportunities using existing schemas.
2. Support status tracking, authorized assignment, moderation, source URLs and deadlines.
3. Never mark an announcement or opportunity officially verified without the appropriate trusted staff workflow.
4. Keep ticket messages and attachments private.

### P5 — AI and analytics
1. Ensure ShieldMind/assistant answers are grounded in approved campus sources and user-authorized records.
2. Keep AI away from private records outside the user's permissions.
3. Report uncertainty; never claim to dispatch emergency services or perform an action that did not happen.
4. Keep analytics permission-aware and CSV exports safe from spreadsheet formula injection.
5. Do not describe heuristic triage as a validated prediction.

## Security review required

Staging Security Advisor findings on 2026-10-23 included tables with RLS enabled but no policies, including private billing/admin tables and `public.campus_identity_evidence_checks`, plus many callable SECURITY DEFINER functions in public. These findings require function-by-function and table-by-table review; do not blindly revoke required functions or add broad policies because that could break trusted workflows. Preserve intended wrappers, check authorization in each privileged function, and follow up with advisor checks after targeted changes.

## Acceptance checklist

- [ ] Existing official logo and favicon preserved.
- [ ] No production DB or repository changes without reviewed PR/approval.
- [ ] Dashboard statistics are real and match the user's allowed records.
- [ ] Auth and password recovery behave correctly.
- [ ] Students cannot self-assign privileged roles or bypass verification.
- [ ] Incident reports are private and campus-scoped.
- [ ] Identity files are private and only accessible after authorization.
- [ ] CampusPulse respects visibility, verification and campus boundaries.
- [ ] Groups, events, RSVPs, helpdesk, notices and opportunities use existing data models where applicable.
- [ ] Academic samples are labelled and not represented as official data.
- [ ] AI responses respect authorization and do not fabricate dispatch or actions.
- [ ] CSV export is permission-filtered and safe.
- [ ] Responsive, accessibility and regression checks run on staging.
- [ ] All results are labelled PASS, FAIL, BLOCKED or NOT RUN with evidence.

## Release rule

This document only records the rollout plan. No UI changes, Supabase migrations, live deployment, or production writes are implied. Implement code on an isolated branch; use staging for database changes; open a reviewable PR; verify CI and end-to-end behavior; then explicitly review deployment before release.
