# Combined Campus Dashboard — Product and Acceptance Specification

**Status:** Proposed implementation specification  
**Target:** Staging feature branch only  
**Product decision:** Combined campus dashboard for students and staff, with role-specific views and permissions  
**Safety rule:** This document does not authorize a production deployment, production database change, pull-request merge, or migration.

## 1. Product outcome

CampusShield AI should be the trusted daily entry point for campus safety and campus life. The dashboard brings together:

- Safety and support: incident reporting, authorized incident updates, and Helpdesk requests.
- Verified Campus Noticeboard: official notices published by authorized campus accounts.
- CampusPulse: moderated posts and campus discussions.
- Events and activities: campus events, clubs, and relevant deadlines.
- Helpful next steps: verification status, pending requests, and relevant updates.

Safety-critical notices and support actions must remain visually prominent. Social engagement must never bury urgent safety information.

## 2. Dashboard structure

### Shared shell

1. CampusShield AI brand and account menu.
2. Selected university identity and account-verification status.
3. Notifications with privacy-safe previews.
4. Prominent Safety / Get Help entry point.
5. Main dashboard cards:
   - Safety & Support
   - Official Notices
   - CampusPulse
   - Events & Helpdesk
6. A campus activity section with upcoming events and moderated feed highlights.
7. Responsive navigation that works on small screens and low-bandwidth connections.

### Account states

- **Signed out:** authentication and account creation only.
- **Pending verification:** show verification progress, required next steps, and permitted onboarding/help content. Do not expose the private campus feed or restricted services.
- **Rejected or action required:** explain the next permitted step without revealing reviewer-only notes or sensitive evidence.
- **Verified and active:** show the dashboard according to the approved university membership and effective permissions.
- **Suspended, revoked, or inactive membership:** deny protected actions and content even if a stale client-side screen remains open.

## 3. Role-aware views

Roles must come from trusted server-side records and authorization checks, not from user-editable form values or client-side state.

| Role | Dashboard emphasis | Access boundary |
| --- | --- | --- |
| Student | Notices, CampusPulse, events, Helpdesk, own report/request status | No access to other users' private documents, restricted reports, or staff queues |
| Teaching staff | Academic notices, campus events, approved discussions, staff services | Staff-only permissions only after approval; no automatic security or admin access |
| Campus support/security staff | Assigned support queues, authorized incident handling, operational updates | Only approved functions and records within assigned campus scope |
| Campus administrator | Campus membership workflows, official notices, moderation and campus settings | Cannot administer another university or appoint platform administrators by default |
| Platform administrator | Explicitly authorized platform-wide governance workflows | Separate, tightly restricted platform-level permission; audited actions |

A person may hold multiple approved responsibilities, but the effective permission set must be explicit, auditable, and scoped. A display label or selected role is never sufficient authorization.

## 4. University isolation and privacy requirements

- Every campus-owned record and action must be scoped to a canonical university identifier.
- The server/database must verify the caller's active membership and required role for each protected read and write.
- Do not trust a client-supplied university ID as proof of membership.
- Cross-campus requests must fail closed, including direct API calls and guessed record IDs.
- Student and staff identity evidence must remain in private storage with ownership- and authorization-scoped access.
- Never render identity documents, student numbers, private reviewer notes, or signed storage URLs in public profiles, posts, feed cards, or notifications.
- Notifications should use minimal previews and require authorization again when opening protected content.
- Use aggregate analytics only where appropriate; do not expose individual safety histories as engagement or marketing data.
- Log sensitive administrative and moderation actions without copying document contents or credentials into logs.

## 5. CampusPulse moderation baseline

Before real users are invited, provide:

- Report-content and block-user controls.
- A campus-scoped moderation queue for authorized moderators.
- Spam and abuse rate limits.
- Clear community rules and a route to appeal moderation decisions.
- Audit records for moderator actions.
- Controls against doxxing, harassment, impersonation, threats, and posting private identity evidence.
- A defined process for urgent safety-related content.

Do not launch unmoderated anonymous accusations or public rankings of incident reporters. Any future anonymous posting feature needs a separate threat model and approval.

## 6. Acceptance tests

The dashboard is not ready for a pilot until the following tests pass in staging with fictional accounts and dummy documents:

1. Pending students cannot read or post to protected CampusPulse areas.
2. An approved student sees only their own university's private campus community.
3. A user from University A cannot read, modify, enumerate, or subscribe to restricted University B records by changing URLs, request bodies, IDs, or client state.
4. Changing a role in browser developer tools does not grant permissions.
5. Teaching staff cannot access security or administrator functions without separately approved permission.
6. Campus administrators cannot act outside their university scope or appoint platform administrators.
7. Private identity documents cannot be accessed by other users or by unauthenticated requests.
8. A notice can be published only by an authorized publisher and is attributed to the correct university.
9. CampusPulse reports, blocks, rate limits, and moderator decisions work as intended and remain campus-scoped.
10. Helpdesk requests are visible only to the requester and explicitly authorized staff for the relevant queue/campus.
11. Notifications do not leak protected content after access is revoked.
12. The dashboard remains usable on mobile widths, keyboard navigation, and slow connections.
13. The prototype clearly states that it does not contact emergency services unless a real, verified integration is later implemented.

Record each test as Pass, Fail, or Blocked, with sanitized screenshots/logs and no passwords, tokens, private IDs, or signed URLs.

## 7. Implementation sequence

1. Review the existing authentication, university membership, role, Helpdesk, Noticeboard, CampusPulse, and identity-verification flows before changing UI.
2. Resolve existing pull-request dependency/conflict issues through review; do not merge automatically.
3. Complete the identity, authorization, private-storage, and cross-campus denial tests.
4. Map the existing pages and services into this dashboard without duplicating data models or bypassing existing permission checks.
5. Implement the responsive shared shell and role-aware cards in a dedicated feature branch.
6. Test each role and account state in staging; include negative authorization tests.
7. Obtain explicit approval before any production rollout.

## 8. Out of scope for this phase

- Production deployment or production database changes.
- Applying unreviewed migrations.
- Merging existing pull requests automatically.
- Real student identity documents or real personal data in tests.
- Claims that the prototype contacts emergency services.
- Engagement mechanics that encourage compulsive use.

## 9. Definition of done

The dashboard is complete only when it is integrated with the existing flows, role and university boundaries are enforced server-side, the acceptance tests pass in staging, accessibility and mobile checks are documented, and all remaining security findings have an owner and disposition. A visual mockup or passing smoke test alone is not sufficient.


## 10. Existing prototype inventory (read-only inspection)

The inspected `index.html` at the feature-stack commit already contains parts of the intended experience, including:

- A campus feature grid and campus-home panel styling.
- CampusPulse post, comment, media, reporting, and moderation UI styling.
- Helpdesk ticket cards, timelines, and staff controls.
- Campus notice cards.
- Responsive navigation and mobile layout rules.
- Student/staff onboarding and staff-verification UI hooks in the existing frontend/backend.

This is a source-level inventory only; it does not certify that every feature works end-to-end or that authorization is secure. Before coding the dashboard, map the existing DOM page IDs, navigation handlers, backend calls, and database policies. Reuse working components and existing authorization paths rather than duplicating the feed, tickets, notices, or identity workflows. Verify the current page structure against the actual branch before editing; do not assume CSS class names prove that a corresponding page or service is complete.


## 11. Concrete integration map from the inspected prototype

### Existing navigation and page IDs

The current shell uses `button[data-page]` and matching `section.page#page-<key>` elements. The inspected navigation keys are:

- `dashboard` — `#page-dashboard`
- `report` — `#page-report`
- `manage` — `#page-manage`
- `risk` — `#page-risk`
- `analytics` — `#page-analytics`
- `approvals` — `#page-approvals`
- `identity-verification` — `#page-identity-verification`
- `staff-verification` — `#page-staff-verification`
- `staff-review` — `#page-staff-review`
- `platform-admin` — `#page-platform-admin`
- `noticeboard` — `#page-noticeboard`
- `helpdesk` — `#page-helpdesk`
- `community` — `#page-community` (CampusPulse)
- `groups` — `#page-groups`
- `events` — `#page-events`
- `marketplace` — `#page-marketplace`

The existing document-level click handler calls `navigate()` and then the appropriate page loader for noticeboard, Helpdesk, CampusPulse, groups, events, marketplace and administrative views. Preserve this routing model unless a reviewed refactor is needed; dashboard shortcuts already use `data-page`.

### Existing dashboard inventory

The current `#page-dashboard` already contains:

- Role-adjusted heading copy for student, teaching staff and campus-admin contexts.
- Incident summary metrics and recent report list.
- A campus feature grid linking to Helpdesk, Verified Noticeboard, CampusPulse, groups, events and marketplace.
- A roadmap note that labels future AI/planner/network capabilities as not yet implemented.
- A prominent new-incident-report action and a prototype warning that emergency services are not contacted.

### Verified integration gaps to address next

The dashboard is currently a **navigation hub**, not yet a complete live campus overview:

1. The feature grid provides links, but the inspected markup does not include a dedicated latest-notices preview, upcoming-events preview, recent CampusPulse highlights, or a Helpdesk status summary.
2. The header's visible refresh status/button is incident-oriented. Do not label it as refreshing every dashboard service unless it really refreshes each one.
3. Student and staff dashboards currently share most of the same cards. Improve relevance by rendering role-appropriate actions only after the trusted profile and campus membership are loaded.
4. Avoid loading protected previews before authorization is resolved. Do not briefly render stale data from a previous account after sign-out or account switching.
5. Prefer small, explicit loader functions for each dashboard preview, each calling the existing service/backend methods and handling empty/error/loading states. Reuse the existing notice, event, feed and Helpdesk loaders where possible; avoid duplicating data access code.
6. Each preview should link to its full page using the existing `data-page` navigation. It must not expose restricted content in a notification or card to users whose access has been revoked.

### Suggested safe implementation order

1. Add an explicit dashboard refresh action that refreshes only the data it actually requests and reports partial failures clearly.
2. Add a latest-notices preview using the existing noticeboard service, with campus scope and expiry filtering enforced by the backend/database.
3. Add an upcoming-events preview using the existing events loader, with date and campus scope handled consistently.
4. Add a CampusPulse preview using the existing feed loader, but only after approved membership is confirmed; do not bypass the moderation/publication state.
5. Add a Helpdesk summary limited to the current user's requests, plus a separate staff queue summary only for authorized campus staff.
6. Add stale-session/account-switch protections and test negative authorization cases before considering a pilot.

No live data queries, UI edits, or browser tests are implied by this inventory. The items above are the next implementation work, not claims of completed behavior.
