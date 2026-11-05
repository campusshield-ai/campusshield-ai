# CampusShield AI — Live Online Classroom

## Current staging implementation

The Online Classroom extends the existing campus-scoped classroom feature. Verified teachers and campus administrators can create classrooms for their own university. A campus administrator owns only the classrooms they create; existing teacher-owned classrooms remain teacher-owned. It adds scheduled live-class sessions, teacher/campus-admin start and end controls, student join controls, optional HTTPS meeting links, and a place to attach a recorded-lecture URL after a session ends.

The database migration is applied to **CampusShield AI Staging only**. The live-session table has RLS enabled, no direct Data API table grants, and all session actions are routed through authenticated RPC wrappers. Those wrappers use verified campus membership, classroom enrolment, teacher, appointed-assistant and campus-admin checks. Admin-created classes are visible and manageable by their verified creator; administrators from other universities cannot read or manage those full classroom resources. Live-class supervision uses its separate same-campus admin permission.

## Integrated video provider

For initial tests, LiveKit Cloud offers a free **Build** plan with no credit card required. Current included WebRTC allowance is 5,000 participant-minutes per month and 50 GB of downstream data transfer. The free plan stops new usage when the included allowance is exhausted; it does not automatically bill overages. Check the provider's current limits before a campus-wide rollout:
- LiveKit Cloud sign-up: https://cloud.livekit.io/
- LiveKit pricing: https://livekit.com/pricing
- LiveKit quotas: https://docs.livekit.io/deploy/admin/quotas-and-limits/


LiveKit is the selected real-time video provider. The browser loads the pinned LiveKit JavaScript client only when a student or lecturer joins a live room. A Supabase Edge Function verifies the caller's JWT, asks the database for a session-specific access context, and mints a short-lived room token. LiveKit API credentials never go to browser code or GitHub.

### Staging-only secrets required

In Supabase Dashboard → **CampusShield AI Staging** → Edge Functions → Secrets, add:

- `LIVEKIT_URL`: the LiveKit WebSocket endpoint, normally `wss://…`.
- `LIVEKIT_API_KEY`: the LiveKit project API key.
- `LIVEKIT_API_SECRET`: the matching LiveKit API secret.

Do not put these values in GitHub, frontend config, HTML, JavaScript, screenshots or chat. Do not add them to the Production Supabase project for this staging test.

The Supabase Edge Functions provide `SUPABASE_URL` and publishable/anon key environment variables automatically. The functions use the caller's JWT and do not use the service-role key.

The staging deployment also includes `campus-live-class-end`. It verifies that the caller is the verified teacher, appointed assistant, or verified campus administrator for the class's university, closes the LiveKit room using the server SDK (disconnecting current participants), and then marks the session as ended in Supabase.

After these three LiveKit secrets are entered in Staging, the `campus-live-class-token` function can mint tokens. Until then, the app still supports scheduled class records and an optional external HTTPS meeting link, while integrated video returns a safe configuration message.

## Rollout gates

1. Apply the migration to Staging and verify RLS, table grants, RPC grants and advisor results.
2. Deploy `campus-live-class-token` and `campus-live-class-end` to Staging with JWT verification enabled.
3. Add the three LiveKit secrets to Staging only.
4. Run the live classroom workflow and authenticated browser checks with verified teacher/admin and student accounts from the same campus. Verify admins can create classes and access the classes they own.
5. Verify admins cannot access full classroom content from another university; cross-campus students, unverified members and anonymous callers cannot list, start, end or join a live class.
6. Verify teacher start/end, student join/leave, microphone/camera/screen-share permissions and an optional HTTPS fallback meeting link.
7. Test narrow mobile layouts and supported browsers before considering a broader rollout.

Recordings are currently represented by teacher-managed HTTPS links; automatic recording/egress storage, assignments, quizzes, grading and deeper academic analytics are later learning-system phases. No production migration or deployment is authorized by this staging implementation.

## Dashboard setup walkthrough

1. Open LiveKit Cloud and create a free Build project.
2. Open that project's API keys/settings page and copy its WebSocket server URL, API key and API secret.
3. Open the CampusShield AI Staging Supabase project, then Edge Functions → Secrets:
   https://supabase.com/dashboard/project/hywcpnoqqhxvujnimhxl/functions/secrets
4. Add the three variable names shown above, using the matching values from the LiveKit project, then save.
5. Do not place the values in GitHub, Vercel, browser configuration, a local file that may be committed, or this chat.
6. Tell the project maintainer that the Staging secrets have been saved (do not send the values). The next test can then verify that the token endpoint reads its runtime configuration.

Supabase documents this dashboard flow at https://supabase.com/docs/guides/functions/secrets. Secrets added to the Supabase Edge Function environment are available to deployed functions immediately; a function redeployment is not required.

