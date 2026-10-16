# CampusShield AI — Student and staff onboarding (staging)

## Registration
- Choose Student or Teacher / university staff.
- Select an active institution from the campus directory during account creation.
- Students provide faculty/school, department, course/programme, and current level.
- Staff provide their university position and may provide an employee number and official university email. After sign-in, they submit a staff ID/employment document or other evidence.

## Verification states
- New accounts remain pending while email confirmation and identity review are completed.
- Student identity documents use the existing private student identity bucket and approval workflow.
- Staff documents use the private `campus-staff-documents` bucket (PDF/JPG/PNG, maximum 5 MiB).
- Only verified campus administrators can read their university's pending staff queue and review staff evidence.
- Rejections must include a reason and the applicant can correct the application and resubmit.
- Pending accounts see onboarding/verification screens; restricted campus features are hidden in the UI and protected by database policies/RPCs.

## Administrator governance
- A claimed position such as Vice-Chancellor, Registrar, Dean, or Head of Department is descriptive information, not authorization.
- Staff verification approves the staff identity and teacher role only.
- Campus administrator assignment remains a separate action available to a trusted CampusShield platform administrator, and is scoped to one institution.
- A campus administrator can review staff evidence for their own university. They do not gain platform-wide access or authority over another university.
- No applicant can grant themselves a campus role by editing browser metadata.

## Staging test checklist
Use fictional names and test-only evidence; never upload real student or staff ID documents in development.

1. Create a student account and confirm the university, faculty, department, course and level are retained.
2. Sign in and confirm student identity verification is the next onboarding step.
3. Create a teacher/staff account and select a position; confirm no admin rights appear from the title alone.
4. Submit staff evidence using the private document upload or official email/staff number.
5. Sign in as a campus administrator for the same university; verify only that university's staff queue is visible.
6. Approve one fictional staff case and reject another with a reason; confirm the applicants see the resulting status.
7. Verify a staff member who requested campus admin consideration remains a teacher until a trusted platform administrator separately assigns campus-admin access.
8. Verify cross-university staff queue access fails and pending accounts cannot use restricted campus interactions.
9. Check the Supabase security advisor and browser console before considering release.

## Release safety
This migration is intended for CampusShield AI Staging only. Do not apply it to production or merge this stacked pull request to `main` until the browser walkthrough and security review pass.
