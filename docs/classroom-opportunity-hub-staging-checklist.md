# Classroom & Opportunity Hub — Staging Acceptance Checklist

**Environment:** CampusShield AI Staging only (`hywcpnoqqhxvujnimhxl`).
**Production boundary:** Do not apply the migration to production, merge this feature stack, or publish the website as part of testing.
**Test data:** Fictional users and dummy learning links only. Never upload real student/staff IDs or real student records.

## Recorded staging results (17 Oct 2026)

- [x] Migration chain applied to staging only; production untouched.
- [x] RLS enabled on classroom, attendance, and Opportunity Hub tables.
- [x] `anon` and `authenticated` have no table-level INSERT/TRUNCATE privileges on the guarded tables.
- [x] Rollback-only synthetic authorization test passed 6/6 assertions: teacher class creation/private code retrieval; student join/role restrictions; cross-campus class isolation; student-own-attendance-only reads; private draft/pending opportunity isolation; and same-campus publish versus cross-campus denial.
- [x] Post-test cleanup verification found zero synthetic users, classes, opportunities, or attendance sessions remaining.
- [ ] Signed-in browser walkthrough and visual UI acceptance are still outstanding.

## Gate 1 — Before applying the migration

- [ ] Review the full SQL diff in `supabase/migrations/20261017202242_classroom_opportunity_hub_security.sql`.
- [ ] Confirm the staging migration ledger does not already contain this version.
- [ ] Confirm latest GitHub Actions smoke checks pass on the current PR head.
- [ ] Take note of existing staging classroom objects and verify the migration is additive/hardening only; it must not drop class data.
- [ ] Apply the migration to staging only, then inspect `pg_policies`, grants, and function execute privileges.

## Gate 2 — Database authorization checks

- [ ] Anonymous user cannot SELECT, INSERT, UPDATE, DELETE, or TRUNCATE classroom, attendance, or opportunity tables.
- [ ] Authenticated users have only explicit column-level SELECT grants; no table-level TRUNCATE/INSERT/UPDATE/DELETE grants on the guarded tables.
- [ ] Pending/unverified account cannot list classes, join a class, create announcements/materials, or read the Opportunity Hub.
- [ ] Verified student can only read classes joined on their own verified campus.
- [ ] Verified student can join a class only using a valid code for their own verified campus; wrong-campus and invalid codes fail.
- [ ] Student cannot retrieve a class join code, post teacher announcements/materials, or read the class roster.
- [ ] Student attendance reads return only their own row; a student cannot see another student's attendance or audit trail.
- [ ] Verified class-owning teacher can create a class, retrieve its join code, publish announcements/material links, and read that class roster/attendance.
- [ ] Teacher cannot manage another teacher's class or access another campus's class by guessing UUIDs.
- [ ] Opportunity drafts and rejected listings are visible only to their owner; reviewers cannot browse another user's draft.
- [ ] Verified campus staff can see and review pending listings only within their own university.
- [ ] Verified campus member cannot read or mutate another university's listings, including guessed UUIDs and RPC calls.
- [ ] Anonymous users cannot read published opportunities; only authenticated verified members of the same campus can.
- [ ] Review notes and internal author/reviewer IDs are not exposed by direct SELECT.
- [ ] Ordinary reviewers cannot mark a listing as officially endorsed; `is_official` stays false unless a separately reviewed trusted-publisher workflow is added.

## Gate 3 — Signed-in browser walkthrough

- [ ] Sign in with a fictional verified teacher and create a test classroom.
- [ ] Retrieve its code as the owning teacher; confirm the code is not present in ordinary class list responses.
- [ ] Sign in as a fictional verified student from the same campus and join the class.
- [ ] Confirm the student sees class announcements and learning links but not teacher-only controls or the roster.
- [ ] Confirm the teacher can add a safe HTTP(S) learning link and publish an announcement.
- [ ] Sign in as a fictional student from a different campus and confirm the class code does not allow joining.
- [ ] Submit an opportunity as a verified campus member; confirm it starts as a draft and is absent from the published feed.
- [ ] Submit the draft for review; confirm only same-campus staff see it in their queue.
- [ ] Publish it as authorized staff; confirm same-campus verified members see it, but anonymous and other-campus users do not.
- [ ] Reject a second listing with a reason; confirm the owner can edit and resubmit it.
- [ ] Confirm expired published listings are excluded from the active feed.
- [ ] Re-test existing CampusPulse, Helpdesk, noticeboard, groups, events, marketplace, incident reporting, and identity verification.

## Gate 4 — Release decision

- [ ] Record results and clean up all synthetic test data using the approved staging cleanup procedure.
- [ ] Review relevant Supabase Security Advisor findings individually; do not blanket-revoke RPCs.
- [ ] Confirm all relevant CI checks pass on the final PR head.
- [ ] Resolve the existing stacked PR dependency chain and its merge conflicts in order.
- [ ] Present the final diff and test evidence to the project owner.
- [ ] Keep production unchanged until the owner explicitly confirms release after all gates pass.

A smoke test passing is not evidence that the signed-in browser walkthrough or staging SQL authorization checks passed. Record each separately.
