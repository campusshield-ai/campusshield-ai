# CampusShield AI staging identity browser walkthrough

**Environment:** CampusShield AI Staging only  
**Data:** fictional test accounts and a dummy document containing no real identity details  
**Do not use:** real student numbers, real ID cards, real passports, production accounts, or production uploads.

## Pre-flight

- Confirm the browser app is pointed at the staging Supabase project `hywcpnoqqhxvujnimhxl`, not production.
- In Supabase Auth, create temporary fictional accounts for Student A, Student B, Campus Admin A, and (if available) Campus Admin B. Assign campus memberships through the supported admin workflow; do not insert auth users directly into `auth.users`.
- Student A and Campus Admin A belong to University A; Student B and Campus Admin B belong to University B.
- Student accounts must be pending identity verification; campus admins must be verified and authorized for their own campus.
- Create a dummy PDF containing only the text: `CampusShield AI STAGING TEST DOCUMENT — fictional data only`. Keep it below 5 MiB.

## Test cases

### 1. Campus selector and lock

1. Sign in as Student A and open Student Identity Verification.
2. Confirm the registered University A is prefilled.
3. Type University B into the search input and try to submit.
4. Expected: the form blocks submission and no file/object or identity submission is created.
5. Restore University A.

### 2. Private upload and pending submission

1. Upload the dummy PDF as Student A and submit the form.
2. Expected: the UI reports success; a pending identity verification row is created for Student A; object path is inside Student A's own UUID folder in the private `student-identity-documents` bucket.
3. Confirm the bucket is private and the app does not create a public URL.

### 3. Cross-user and cross-campus isolation

1. Sign in as Student B and attempt to view Student A's verification record or retrieve Student A's object path.
2. Expected: access is denied.
3. Sign in as Campus Admin B and attempt to review Student A's submission.
4. Expected: cross-campus access is denied.

### 4. Authorized administrator review

1. Sign in as Campus Admin A and open the identity/account approvals workflow.
2. Confirm Student A's pending submission is visible to the authorized same-campus admin.
3. Approve Student A.
4. Expected: status becomes approved/verified and the student's account reflects the approved state.
5. Repeat with a separate fictional student submission and reject it with a review note.
6. Expected: status becomes rejected; the student cannot access verified-only features and can only resubmit according to the existing rejection/resubmission policy.

### 5. Cleanup

- Remove temporary identity submissions, dummy objects and temporary auth users using the supported admin tools after recording results.
- Confirm `student_identity_verifications` has no test rows and `storage.objects` has no objects for the test users in `student-identity-documents`.
- Do not delete or modify real accounts, university rows, or production data.

## Evidence to record

For each test, record pass/fail, timestamp, test account label (not email/password), and a redacted screenshot or console/network error. Never include passwords, access tokens, student IDs, signed URLs, or identity documents in the evidence.

## Current status

This document is a runbook, not evidence that the browser walkthrough has passed. Static smoke tests and database policy inspection have passed, but a real signed-in browser walkthrough with temporary test accounts and a dummy upload remains a manual release gate.
