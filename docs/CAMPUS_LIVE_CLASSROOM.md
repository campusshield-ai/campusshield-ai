# CampusShield AI — Live Online Classroom

## Production implementation

CampusShield Live Classroom extends the existing campus-scoped classroom feature. Verified lecturers (the application's `teacher` role) and verified campus administrators can manage live sessions for classrooms at universities where they hold an active, verified membership. Lecturers manage the classrooms assigned to them; a verified campus administrator can supervise and manage classrooms across their own university. Administrators from other universities cannot view or manage those classes.

The staff control panel is visible only when the authenticated capability RPC confirms that the current user can manage the selected classroom. It provides class scheduling, start, end, external HTTPS fallback links and recorded-lecture links. Enrolled students can view the schedule and join live sessions, but cannot schedule, start, end or manage recordings.

The `campus_live_class_sessions` table has RLS enabled and no direct Data API grants. Client operations go through narrow authenticated RPC wrappers. Public RPCs are `SECURITY INVOKER`, pinned to an empty search path, and executable by authenticated users only. Their private implementations enforce campus membership, classroom access and lecturer/admin permissions.

## Multi-campus membership

The live-classroom selector uses every active, verified campus membership belonging to the signed-in user rather than relying on one implicit “current campus” membership. This prevents an administrator or lecturer who legitimately belongs to more than one university from having valid classrooms hidden by an arbitrary membership choice. Each returned classroom is still filtered through the same per-classroom authorization helper.

## Integrated video provider

LiveKit Cloud provides real-time audio, camera and screen-sharing sessions. The browser loads the pinned LiveKit JavaScript client only when a user joins a live room. Supabase Edge Functions verify the user's JWT, ask the database for a session-specific access context and mint short-lived room tokens. LiveKit API credentials remain server-side.

### Required Supabase Edge Function secrets

Configure the following in the matching Supabase environment. Staging and Production must use different LiveKit projects and credentials.

- `LIVEKIT_URL`: the LiveKit WebSocket endpoint, normally `wss://…`.
- `LIVEKIT_API_KEY`: the API key from that same LiveKit project.
- `LIVEKIT_API_SECRET`: the matching API secret.

Never place these values in GitHub, frontend config, HTML, JavaScript, Vercel variables, screenshots or chat. Keep secrets in Supabase Dashboard → Edge Functions → Secrets. Supabase makes newly saved secrets available to deployed functions without requiring a function redeployment.

The following functions are deployed with JWT verification enabled:

- `campus-live-class-token` — verifies the caller and mints a room-scoped LiveKit token.
- `campus-live-class-end` — authorizes a lecturer/admin to close the provider room, disconnects participants and marks the class as ended.

### Validation completed

- Staging CI and role-aware integration checks: 21/21 passing.
- Staging two-browser media acceptance: lecturer and enrolled student connected; microphone, camera, screen share, class shutdown and synthetic-data cleanup passed.
- Production database migrations, RPC permissions and Edge Function deployment verified.
- Production website deployment returned HTTP 200 and includes the Live Classroom UI assets.

A separate authenticated Production two-user media acceptance should be completed with real verified lecturer and student accounts before a wider campus rollout. Never use real student records for automated tests.

## Access model

| Capability | Verified lecturer assigned to class | Verified campus admin at class university | Enrolled student |
|---|---:|---:|---:|
| List accessible classrooms | Yes | Yes | Yes |
| Schedule a live class | Yes | Yes | No |
| Start a scheduled class | Yes | Yes | No |
| End a live class | Yes | Yes | No |
| Add a recording link after class ends | Yes | Yes | No |
| Join a live class | Yes | Yes | Yes |
| Manage classes at another university | No | No | No |

Assistant/attendance permissions remain governed by the underlying classroom permission helpers and are not broadened by the campus-admin Live Classroom scope.

## Current product boundaries

Recordings are represented by lecturer/admin-managed HTTPS links; automatic recording/egress storage is a later phase. Assignments, quizzes, grading and deeper academic analytics are also future learning-system phases.
