# CampusShield Classroom Staging E2E Test

This test is intentionally limited to the staging Supabase project configured in `supabase-config.js`. Do not point it at production.

## Required fictional test accounts

Create these through the normal staging sign-up and verification workflow. Use reserved `@example.com` addresses and fictional details only.

- **Teacher:** profile role `teacher`, verification status `verified`, and an active, verified teacher campus membership.
- **Student:** profile role `student`, verification status `verified`, and an active, verified student campus membership at the same university as the teacher.
- **Cross-campus student:** profile role `student`, verification status `verified`, and an active, verified student campus membership at a different university.

The enrolled student doubles as the assistant for this test. The test does not create or promote accounts and will fail its preflight checks if the fixtures do not meet these requirements.

## Run from the repository root

Use a current Node.js release with native `fetch` support (Node 18 or newer). In PowerShell, set the environment variables for the three fictional accounts:

```powershell
$env:CAMPUSSHIELD_TEST_TEACHER_EMAIL = "fictional.teacher@example.com"
$env:CAMPUSSHIELD_TEST_TEACHER_PASSWORD = "YOUR_TEST_PASSWORD"
$env:CAMPUSSHIELD_TEST_STUDENT_EMAIL = "fictional.student@example.com"
$env:CAMPUSSHIELD_TEST_STUDENT_PASSWORD = "YOUR_TEST_PASSWORD"
$env:CAMPUSSHIELD_TEST_OUTSIDER_EMAIL = "fictional.outsider@example.com"
$env:CAMPUSSHIELD_TEST_OUTSIDER_PASSWORD = "YOUR_TEST_PASSWORD"
node tests/classroom-staging-e2e.mjs
```

Do not commit passwords, place them in source files, or send them in chat. These environment variables only live in the current PowerShell session.

## What it checks

- Teacher can create a class and retrieve the private join code.
- Same-campus verified student can join; cross-campus student cannot join or see the class.
- Enrolled student can read teacher announcements and learning materials.
- A student cannot create attendance sessions before appointment.
- Teacher can appoint an enrolled student as assistant.
- Assistant cannot publish teacher-only announcements but can create an attendance session and mark attendance.
- Removing the assistant revokes attendance-session access.

## Cleanup

The test prints `CLEANUP_REQUIRED classroom_id=...` after creating its staging-only class. It deliberately does not delete through the public API because ordinary users should not be granted destructive classroom permissions. After reviewing the test result, remove the synthetic test class and its dependent records from the **staging** database only, using an authorized database administrator. Do not run cleanup against production.

The script does not deploy, merge, create accounts, change account verification, or contact the production project.
