# CampusShield AI — Staging Acceptance Checklist

Use this checklist before considering PR #14 ready for review or any production release.

## Safety boundaries

- [ ] Use **CampusShield AI Staging** only (Supabase project ref: `hywcpnoqqhxvujnimhxl`).
- [ ] Use fictional accounts, a test university, and dummy documents only (PDF/JPG/PNG, at most 5 MiB).
- [ ] Do not use real student/staff IDs, real student records, production credentials, or production storage.
- [ ] Do not merge PR #8, #13, or #14 or deploy to production until all applicable checks pass and the project owner explicitly approves.
- [ ] Record each result as Pass / Fail / Blocked with a short note. Never record passwords, tokens, signed URLs, or document contents.

## A. Registration and access states

- [ ] Register a fictional student; confirm role and selected university are saved.
- [ ] Confirm student faculty/school, department, course/programme, and current level can be completed and saved.
- [ ] Register a fictional university staff member; confirm staff-specific details are collected.
- [ ] Confirm a pending account cannot use restricted community, campus, helpdesk, noticeboard, or other verified-only actions.
- [ ] Confirm changing client-side UI state or calling an endpoint directly does not bypass server-side authorization.

## B. Student identity verification

- [ ] Sign in as a fictional **pending student** and submit a dummy ID document within the size/type limit.
- [ ] Confirm the document uploads to private storage and is not publicly accessible.
- [ ] Confirm the submission creates one pending verification linked to the signed-in account and locked university.
- [ ] Confirm a verified student cannot submit a new initial verification as though still pending.
- [ ] Confirm resubmission is permitted only after rejection, and that the prior decision remains auditable.
- [ ] As an authorized reviewer from the same university, open the document only through the intended protected review flow.
- [ ] Approve a test submission and confirm the account state changes only through the authorized review path.
- [ ] Repeat with a rejection and required reason; confirm the student sees the reason and can resubmit.
- [ ] Attempt to review the same record as an account from a different university; confirm denial.

## C. Staff evidence and review

- [ ] Submit a dummy staff ID/employment document and verify the private bucket restrictions.
- [ ] Confirm a same-university verified campus administrator can review the application.
- [ ] Confirm rejection requires a reason and enables the intended resubmission path.
- [ ] Confirm a reviewer from another university cannot read, approve, reject, or obtain a signed URL for the application/document.
- [ ] Confirm a title, staff email, staff number, or checkbox alone does not grant staff verification or administrator permissions.
- [ ] Record an evidence check with a source, outcome, reference, and note; verify the audit history shows reviewer and timestamp.
- [ ] Confirm an “institution confirmed” outcome is rejected unless an authoritative source and traceable reference are supplied.

## D. Campus administrator appointment

- [ ] Confirm only a trusted platform administrator can review a campus administrator appointment request.
- [ ] Confirm a staff member must first be verified and must explicitly request appointment.
- [ ] Appoint a fictional test administrator to one university and confirm the scope is limited to that university.
- [ ] Confirm the new campus administrator cannot manage another university or grant themselves platform-admin status.

## E. Negative authorization and storage tests

- [ ] Unauthenticated/anonymous requests cannot execute protected review, appointment, or audit-history RPCs.
- [ ] Direct table access cannot read or write private evidence-audit records outside the guarded RPCs.
- [ ] A user cannot change their university by editing the client request after joining.
- [ ] A user cannot update protected profile fields or elevate their role through direct table updates.
- [ ] A user cannot mark another user's marketplace listing sold or modify protected listing fields.
- [ ] Confirm private documents remain private after rejection, approval, sign-out, and a fresh session.
- [ ] Confirm invalid MIME types, oversized files, and cross-user storage paths are denied.

## F. Core experience regression

- [ ] University directory search and the “Can’t find your university?” request flow work in staging.
- [ ] Submit one fictional university request, approve it through the authorized admin workflow, and verify the expected directory outcome.
- [ ] Confirm Helpdesk, verified campus noticeboard, and CampusPulse features respect account verification and university boundaries.
- [ ] Confirm no live emergency-services contact is implied; retain the prototype/demo notice until real emergency integrations are approved.

## G. Evidence and release decision

For each test, note: test ID, date, test role, result, and non-sensitive observations.

- [ ] Re-run the GitHub Actions smoke checks and confirm they pass on the reviewed commit.
- [ ] Review each remaining Supabase Security Advisor finding individually; do not apply blanket grants/revokes to SECURITY DEFINER functions.
- [ ] Verify leaked-password protection in Supabase Auth settings before launch.
- [ ] Review and remove test accounts/documents created during testing; verify cleanup without deleting required storage buckets or schema.
- [ ] Capture screenshots of key successful and denied flows, with personal data and tokens excluded.
- [ ] Keep PRs open/unmerged until the acceptance checklist, security review, and owner approval are complete.

## Current known limitation

Automated smoke checks are not a substitute for authenticated browser testing. Mark browser-dependent tests **Blocked** until executed in the staging browser; do not report them as passed based on static tests alone.
