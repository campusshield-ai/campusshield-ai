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
