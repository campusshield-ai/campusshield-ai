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
- `CAMPUSSHIELD_STAGING_CAMPUS_B_NAME` — exact staging campus B name.

The service-role key can bypass RLS and must be scoped only to staging. If any listed fixture is missing, stop and configure the staging fixture; do not bypass RLS or manufacture identity rows with privileged SQL to make tests pass.

## Run

The runner uses only Node.js built-ins and Supabase REST/Auth/Storage APIs; it does not require an npm package or lockfile.
```sh
node tests/staging-identity-auth-matrix.mjs
```

CI is gated by configured environment secrets and manual dispatch. On a successful run, the log should show the named PASS assertions and a final cleanup confirmation. A skipped run is not a passing authenticated test.

## Coverage boundaries

The runner uses the real authenticated campus-membership RPC, uploads a tiny synthetic PDF to the private storage bucket, submits identity through the real RPC, and checks ordinary rejection, correction/resubmission, approval, confirmed-fraud grace/deadline handling, blocked protected interaction after deadline, peer-row privacy, and cross-campus review denial. To fast-forward the deadline, it uses a service-key REST update filtered to the unique synthetic user's identity row only; no other row should be touched. Cleanup deletes only paths and Auth user IDs recorded during the run, in a `finally` path, then verifies Auth user deletion. The workflow only reports passing if the test runner exits successfully and cleanup succeeds. Keep PR #26 draft until the protected workflow has actually run and output is reviewed.
