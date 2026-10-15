# CampusShield AI staging browser validation

## Safety boundary

- Run only from branch `staging/browser-test-environment`.
- This branch's `supabase-config.js` is pinned to project ref `hywcpnoqqhxvujnimhxl` and refuses a production project ref.
- Do not cherry-pick the staging config into `main` or the feature PR.
- Use only fictional accounts and test content. Never use production credentials, student records, incident data, or media.
- The publishable key is browser-safe; never use a Supabase secret or service-role key in the browser.

## Before browser tests

1. Confirm the address bar is the staging preview and the loaded config targets `https://hywcpnoqqhxvujnimhxl.supabase.co`.
2. Confirm the app's browser console has no config, JavaScript, or network errors.
3. Ensure staging Auth permits the test signup flow. If email confirmation is enabled, use a dedicated test mailbox or a trusted staging-only Auth admin workflow; do not disable confirmation on production.
4. Create fictional test identities for University A student, University A staff, University B student, and platform administrator. The platform-admin identity must be provisioned by a trusted database owner; never attempt self-registration.
5. Use harmless test media only, and delete test rows/files after the run where practical.

## Test cases

- [ ] Sign up with a fictional student identity; confirm profile creation and sign-in.
- [ ] Choose University A; confirm membership is pending/appropriate and campus context persists after refresh.
- [ ] Sign out and sign back in; confirm session restoration and correct campus context.
- [ ] Submit an incident; confirm it appears for its reporter and authorized same-campus staff.
- [ ] Approve a test account as authorized campus staff; verify status changes and unauthorized users cannot approve.
- [ ] Update an incident status as authorized staff; verify a student cannot perform staff-only updates.
- [ ] Create a community post and comment; test reactions, poll vote, follow, bookmark, repost, and content report.
- [ ] Create a group, event, and marketplace listing; verify pending items are not public until moderated and RSVP/report flows behave correctly.
- [ ] Submit a fictional university request; with the trusted platform-admin account, approve/reject it and verify the resulting directory/request state.
- [ ] Assign a campus admin only to a verified staff identity with an active, verified membership at that same university.
- [ ] Upload a harmless photo and short test video; verify private storage, same-campus signed playback, expiration behavior, and denial for a different-campus user.
- [ ] Attempt cross-campus reads and mutations as University B student against University A records; all must be denied or return no rows.
- [ ] Call each authenticated `SECURITY DEFINER` RPC as a normal student and wrong-campus user where relevant; confirm role checks, tenant checks, and no data leakage.
- [ ] Check browser console, network requests, storage access, and Supabase Auth logs for unexpected errors.
- [ ] Clean up test identities, rows, objects, and test university requests.

## Current limitations

The source-level GitHub smoke check is not an end-to-end browser test. Mark a test complete only after observing its actual browser result and verifying the corresponding staging database/storage effect. Do not merge PR #8 or apply feature migrations to production until the test evidence and security review are complete.
