# CampusShield AI — Live Online Classroom

## Current staging implementation

The Online Classroom extends the existing campus-scoped classroom feature. It adds scheduled live-class sessions, teacher/assistant start and end controls, student join controls, optional HTTPS meeting links, and a place to attach a recorded-lecture URL after a session ends.

The database migration is applied to **CampusShield AI Staging only**. The live-session table has RLS enabled, no direct Data API table grants, and all session actions are routed through authenticated RPC wrappers. Those wrappers use the existing verified campus membership, classroom enrolment, teacher and appointed-assistant checks.

## Integrated video provider

LiveKit is the selected real-time video provider. The browser loads the pinned LiveKit JavaScript client only when a student or lecturer joins a live room. A Supabase Edge Function verifies the caller's JWT, asks the database for a session-specific access context, and mints a short-lived room token. LiveKit API credentials never go to browser code or GitHub.

### Staging-only secrets required

In Supabase Dashboard → **CampusShield AI Staging** → Edge Functions → Secrets, add:

- `LIVEKIT_URL`: the LiveKit WebSocket endpoint, normally `wss://…`.
- `LIVEKIT_API_KEY`: the LiveKit project API key.
- `LIVEKIT_API_SECRET`: the matching LiveKit API secret.

Do not put these values in GitHub, frontend config, HTML, JavaScript, screenshots or chat. Do not add them to the Production Supabase project for this staging test.

The Supabase Edge Function provides `SUPABASE_URL` and publishable/anon key environment variables automatically. The function uses the caller's JWT and does not use the service-role key.

After these three LiveKit secrets are entered in Staging, the `campus-live-class-token` function can mint tokens. Until then, the app still supports scheduled class records and an optional external HTTPS meeting link, while integrated video returns a safe configuration message.

## Rollout gates

1. Apply the migration to Staging and verify RLS, table grants, RPC grants and advisor results.
2. Deploy `campus-live-class-token` to Staging with JWT verification enabled.
3. Add the three LiveKit secrets to Staging only.
4. Run the live classroom workflow and authenticated browser checks with synthetic verified teacher and student accounts from the same campus.
5. Verify cross-campus students, unverified members and anonymous callers cannot list, start, end or join a live class.
6. Verify teacher start/end, student join/leave, microphone/camera/screen-share permissions and an optional HTTPS fallback meeting link.
7. Test narrow mobile layouts and supported browsers before considering a broader rollout.

Recordings are currently represented by teacher-managed HTTPS links; automatic recording/egress storage, assignments, quizzes, grading and deeper academic analytics are later learning-system phases. No production migration or deployment is authorized by this staging implementation.
