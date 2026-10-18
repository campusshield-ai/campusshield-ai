# Authenticated student identity staging tests

This suite is deliberately staging-only. It must never run against production or use real student accounts or documents.

## Safety / execution

- Required project ref: `hywcpnoqqhxvujnimhxl`.
- Use a dedicated staging GitHub Actions environment named `campusshield-staging-identity-tests`, with environment reviewers required.
- Never put secrets in repository files, commit history, browser configuration, pull request comments, or logs.
- The test runner refuses any URL not matching `https://hywcpnoqqhxvujnimhxl.supabase.co` and requires `CAMPUSSHIELD_STAGING_TEST_CONFIRM=hywcpnoqqhxvujnimhxl`.
- Use fictional accounts only. Never upload real student IDs.
- The test runner cleans up created Auth users in `finally` and verifies deletion. If cleanup fails, the run fails and reports the affected synthetic IDs so they can be removed manually. Do not consider the run complete until cleanup is confirmed.

## GitHub environment secrets / variables

Configure these in repository Settings → Environments → `campusshield-staging-identity-tests`. The connector cannot create GitHub Actions secrets on your behalf.

**Secrets**
- `CAMPUSSHIELD_STAGING_SUPABASE_URL` — must be `https://hywcpnoqqhxvujnimhxl.supabase.co`.
- `CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY` — staging-only Admin API key; never the production key.
- `CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY` — staging publishable key (or use `CAMPUSSHIELD_STAGING_SUPABASE_ANON_KEY` for a legacy staging anon key).
- `CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL`, `CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD` — pre-existing synthetic verified admin at campus A.
- `CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL`, `CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD` — pre-existing synthetic verified admin at campus B.
- `CAMPUSSHIELD_STAGING_TEST_CONFIRM` — exact value `hywcpnoqqhxvujnimhxl`.

**Environment variables**
- `CAMPUSSHIELD_STAGING_CAMPUS_A_ID`, `CAMPUSSHIELD_STAGING_CAMPUS_B_ID` — distinct staging campus UUIDs.
- `CAMPUSSHIELD_STAGING_CAMPUS_A_NAME` — exact staging campus A name.
- `CAMPUSSHIELD_STAGING_STUDENT_OBJECT_PATH` — path to a synthetic JPEG/PNG/PDF upload belonging to the temporary student; only create this through the student-authenticated Storage upload flow. Never point to a real identity file.

The service-role key can bypass RLS and must be scoped only to staging. If any listed fixture is missing, stop and configure the staging fixture; do not bypass RLS or manufacture identity rows with privileged SQL to make tests pass.

## Run

Install dependencies with the repository's pinned Node dependency setup, then run:
```sh
node tests/staging-identity-auth-matrix.mjs
```

CI is gated by configured environment secrets and manual dispatch. On a successful run, the log should show the named PASS assertions and a final cleanup confirmation. A skipped run is not a passing authenticated test.

## Coverage boundaries

The runner performs authenticated probes for self-only fraud status, peer-row privacy, cross-campus review denial, ordinary rejection vs confirmed fraud, and the 48-hour notice interval. Correction/resubmission and the final protected-access outcome need a valid synthetic uploaded object and proper app-created campus memberships. The workflow will only call this suite “passed” if the runner exits successfully; it must not infer completion from the static smoke test. Keep PR #26 draft until all four critical behaviors are exercised against the authenticated staging project and the synthetic-user cleanup is verified.
