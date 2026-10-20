# CampusShield AI — Latest Staging Build

Build label: `2026-10-20-staging-google-login-dashboard`
Source branch: `codex/campusshield-all-ideas-staging`
Release status: staging preview only — do not publish to production.

## How to verify that this is the correct bundle
The extracted root folder should include:
- `index.html` — login role selector, institution hint, show/hide password buttons, Google sign-in button, student/teacher dashboard, ShieldMind AI, classroom and opportunity pages.
- `campusshield-backend.js` — OAuth helper and the protected backend integrations.
- `campusshield-backend-identity-addon.js` — identity verification integration.
- `shieldmind-planner.js` — private timetable/reminders.
- `supabase-config.js` — selects staging on localhost and keeps the GitHub Pages production host on production.
- `docs/GOOGLE-SIGNIN-STAGING-SETUP.md` — Google/Supabase staging setup.
- `supabase/functions/shieldmind-chat/index.ts` and `supabase/migrations/` — backend functions and migrations.
- `tests/shieldmind-learning-planner-smoke-check.mjs` — source regression checks.

## Correct way to install the full updated source
1. Download the ZIP from the latest branch URL: https://github.com/campusshield-ai/campusshield-ai/archive/refs/heads/codex/campusshield-all-ideas-staging.zip
2. Extract into a completely new empty folder, such as `CampusShield-AI-Staging-2026-10-20`. Do not extract over an old folder. Old extra files can remain and make the result look like a mixed version.
3. Open that new folder in VS Code and verify this `UPDATE-NOTES.md` file is present.
4. Check `supabase-config.js` before testing. Localhost uses staging; the configured production hostname is intentionally mapped to production.
5. Start Live Server at `http://127.0.0.1:5500`. Scroll to the top of the login card to see role/institution controls; the Google button is lower in the same card.
6. A successful GitHub smoke check verifies source-level tests only; it does not replace clicking through Google OAuth in a real browser.

## Included ideas
- Administrator/Teacher/Student sign-in hint; institution name hint; password visibility toggle.
- Google OAuth button, with provider status check and staging-only project guard. Google account authentication does not grant a CampusShield role or campus approval.
- Student/teacher role-aware dashboard with authorized classes, announcements, notices, events, and teacher-owned roster summaries.
- ShieldMind academic help, study-note and quiz prompts, study-image support and usage safeguards.
- Private cloud-synced timetable, assignments, exams and reminders.
- Teacher Classroom, attendance and the campus-scoped Gift & Opportunity Hub.

## Security boundaries
- This is a staging integration branch, not a production release.
- Google OAuth uses staging Supabase project `hywcpnoqqhxvujnimhxl`; the user must configure client credentials in the staging provider settings and complete a browser test.
- Do not commit OAuth client secrets, OpenAI API keys, Paystack secret keys, or other provider credentials.
- Use fictional staging accounts and academic-only images. Do not upload student IDs, incident reports, private Helpdesk items, attendance records, passwords, or medical documents.
