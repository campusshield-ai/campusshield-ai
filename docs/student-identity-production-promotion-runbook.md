# Student identity verification — Production promotion runbook

## Release rule

Promote this feature backend-first. Do not merge the frontend changes into `main` until the Staging release gates below have passed. The public site is deployed from `main`, and the frontend calls `student-identity-upload-scan`; merging before Production has the matching database schema and Edge Function can break student identity submissions.

## Current environment assessment (14 November 2026)

### Staging

- `student-identity-upload-scan` is ACTIVE at version 25 with JWT verification enabled.
- The function source deployed to Staging matches the current feature-branch source.
- The automation migration logic is present in Staging: the automated review fields, private audit table, and service-role-only approval routine.
- Both identity storage buckets are private and configured for JPEG, PNG and PDF with a 5 MiB limit.
- The approval routine is not executable by `anon` or `authenticated`; it is executable by `service_role`.
- The automated review audit table is not readable by `anon` or `authenticated`.
- A real student submission through the complete scanner-and-verifier path has not yet been recorded. Do not describe automatic approval as end-to-end verified.

### Production

- The base `student_identity_verifications` and `student_identity_upload_scans` tables exist, including the fields required by the upload function.
- Both identity storage buckets already exist, are private, and have the expected file-size and MIME restrictions.
- Production does not yet have the automated review fields/audit table/approval routine introduced by:
  - `20261114140000_student_identity_automated_verification.sql`
  - `20261114142000_identity_auto_approve_accept_verified_scan_state.sql`
- Production does not yet have the `student-identity-upload-scan` Edge Function.
- The availability of the required Edge Function secrets has not been verified through the current administrative connection. Check them in Supabase Dashboard without copying secret values into chat.

## Required Staging gates

1. Configure the Staging Edge Function secrets directly in Supabase:
   - `MALWARE_SCANNER_URL`
   - `MALWARE_SCANNER_TOKEN`
   - `UNIVERSITY_ID_VERIFIER_URL`
   - `UNIVERSITY_ID_VERIFIER_TOKEN`
   - `UNIVERSITY_ID_VERIFIER_NAME`
   - `UNIVERSITY_ID_VERIFIER_ALLOWED_HOSTS`
2. The malware scanner must be a trusted HTTPS service. The verifier host must be explicitly allow-listed. Do not use a guessed or public endpoint as an institutional authority.
3. Confirm that the university or authorised national provider has approved CampusShield's use of its verifier, supplied its API contract/sandbox, and agreed to the personal-data fields and retention purpose.
4. Use a synthetic Staging student account and a provider-approved test fixture. Exercise the full upload flow: consent, MIME/signature validation, quarantine, malware scan, private-file promotion, identity submission, official positive response, and database approval.
5. Test negative cases: no consent, missing secrets, scanner unavailable, infected file, malformed verifier response, non-matching university/student number, inactive enrolment, duplicate matric number/hash, unconfirmed email, and verifier timeout. These must remain pending/manual review or reject the file; none may auto-approve.
6. Verify the audit event, private storage paths, account role, requested role, verification status, and active campus membership after each relevant outcome.
7. Re-run the Node pre-launch smoke checks and all applicable required GitHub Actions checks. Resolve the unrelated ShieldMind/Paystack Staging acceptance failure by supplying valid Staging provider quota and a Paystack **test** secret; never enable live payments to make a test pass.

## Production promotion sequence

Only after all Staging gates pass:

1. Confirm the authorised provider contract and Production credentials through the institution/provider's approved channel.
2. Apply the two automation migrations to Production and verify the columns, audit table, RLS, function grants and constraints.
3. Deploy `student-identity-upload-scan` to Production with `verify_jwt=true`, including every required relative dependency.
4. Configure Production scanner and verifier secrets directly in Supabase. Never put secret values in Git, PR comments, client JavaScript, or chat.
5. Run a controlled Production smoke test with an explicitly approved test identity or a provider-approved non-production verification mode. Do not create a false student record or auto-approve a real person as a test.
6. Confirm manual-review fallback works when the verifier is unavailable and that only a definitive, exact positive official response can call the service-role approval routine.
7. Only then merge the frontend PR to `main` and verify the live registration and identity-upload flow.

## Safety invariants

- A malware-clean result means only that the file passed the malware scan. It is not proof that the ID is genuine or that the person is currently enrolled.
- A university email inbox confirmation proves access to that mailbox, not active student status. Personal email remains an acceptable signup route; university email is optional.
- Automatic approval is limited to pending student applications and requires all exact positive fields from an authorised institutional verifier, a matching university/student number, an approved clean file, confirmed email, no duplicate identity signal, and an active campus membership.
- Never auto-approve staff, teachers, security, finance or administrator roles.
- Any missing, ambiguous, unavailable or inconsistent evidence must remain pending for authorised campus review.
- Keep identity evidence private and least-privilege. Do not log raw student IDs, document contents, access tokens or verifier secrets.

## Current release status

PR #352 remains open and unmerged. Staging code and schema are prepared, but the full real-provider E2E path remains unverified. Production has the base identity tables and private buckets, but the new automation migrations and upload-scan Edge Function must be promoted before the frontend can safely be merged.
