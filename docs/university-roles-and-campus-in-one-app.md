# CampusShield AI: university roles and the campus-in-one-app plan

This document separates **what is implemented today** from **what the product should add next**. A university job title is not an application role and never grants permissions by itself.

## Current system roles

| System role | Current scope | Explicitly excluded |
|---|---|---|
| Student | Own profile and identity workflow; own timetable; classes and course communities where enrolled; past-question/exam preparation; ShieldMind features where configured; CampusPulse/community, groups, events, opportunities and marketplace; private safety incident submission and status visible under database policy. | Other users’ private reports; incident resolution; staff-review queues; institutional finance; campus or platform administration. |
| Teacher / university staff | Approved staff workspace; assigned classroom and learning tools; attendance/materials and class sessions where assigned; approved campus notices and campus opportunities. | Incident management; campus-wide approvals; institutional finance unless separately appointed; cross-university access; platform administration. |
| Security | Verified campus safety operations, incident triage and updates permitted by policy; authorized campus safety analytics. | Staff verification approvals, institutional billing, student fee handling, campus administration and platform administration. |
| Campus administrator | Same-university staff/account review, campus-level workflows, incident management and analytics where the current policy permits. | Other universities’ data; trusted platform administration; personal finance transfers or payment-provider secrets. |
| CampusShield platform administrator | Privileged directory and platform operations only for pre-provisioned trusted accounts. | A campus account or senior university job title alone never grants this role. |

## Finance officer / Bursar access

Finance is a **capability attached to a verified staff member**, not a fifth account role.

1. The person registers as university staff and submits staff identity evidence.
2. A campus administrator at that university reviews the evidence and approves the staff record.
3. The campus administrator separately appoints an eligible Bursar, Director of Finance, Finance Officer, Accountant, Accounts Officer or Treasurer using the University Finance Appointments panel.
4. The appointment can be revoked and is recorded in a private audit table.
5. The finance officer can submit an institutional CampusShield billing request and see the requests they personally submitted for that university. Supabase RLS checks the identity, active membership, university ID and appointment; the browser does not confer the permission.

**Not enabled by this appointment:** paying a university invoice, collecting student school fees, reconciliation, refunds, disbursements, changing prices, viewing other users’ billing records or accessing payment-provider credentials. Those require a separate finance ledger, invoice/payment workflow, maker-checker approval, server-side Paystack transaction initialization and webhook verification, and tested production configuration. The older institutional invoice/subscription draft must not be treated as live payment capability.

## Other university positions

Registrar, Deputy Registrar, Vice-Chancellor, Deputy Vice-Chancellor, Dean, Head of Department, University Librarian, ICT Administrator, Student Affairs Officer, Medical Services Staff and other employees can record their real job title and submit the same staff identity evidence. Their titles do not automatically grant registrar, HR, library, medical, ICT, campus-admin, security or finance access.

Those workflows should be added as narrow, independently appointed capabilities, each tied to one university, a documented responsibility, a review process, and an audit trail. For example:

- Registrar’s Office: academic records requests, registration holds, clearance and transcript request routing.
- Faculty / Department leadership: approved course and departmental administration, staff and timetable coordination.
- Student Affairs: welfare requests, accommodation referrals, clubs, conduct case routing and notices.
- Medical Services: appointment information and referrals with strict access to sensitive records; not a general staff dashboard.
- ICT / Helpdesk: service tickets, asset and outage updates, knowledge-base publishing and account support without access to private academic or medical records.
- Library: catalogue links, borrowing status integrations and library notices.
- Facilities / Transport / Hostel: maintenance reports, shuttle information, accommodation requests and service status.
- Finance / Bursary: institution subscriptions and invoices first; student fee collection only after a separately designed, institution-approved payment and reconciliation workflow.

## CampusShield today: one place for university life

The product already has a growing foundation: CampusPulse and private messaging, timetable, course communities, Live Classroom, past questions and exam preparation, ShieldMind AI, groups and events, marketplace, opportunities, helpdesk, verified noticeboard, university service directory/crawler, CampusMap and campus safety reporting/analytics. Availability still depends on the deployed environment, configured providers, verified campus data and current role policies.

## Recommended next product phases

### Phase 1 — Role and campus foundation
- Keep system roles fixed and add individually appointed capabilities for Finance, Registrar, Student Affairs, ICT, Library and Facilities.
- Add a university staff directory with verified department, position, office contact and approval state.
- Add scoped audit history, revocation, delegated appointments and clear “who can do what” explanations.
- Keep every capability tied to one verified university.

### Phase 2 — Academic life
- Course registration and add/drop workflow integrations.
- Exam timetable, results-release notices and transcript request tracking.
- Lecturer office hours, appointment booking, class attendance and learning-resource workflows.
- Academic calendar sync and deadline reminders.

### Phase 3 — Student services
- Hostel/accommodation applications, allocation and maintenance requests.
- Shuttle/transport routes, campus facilities and lost-and-found.
- Student Affairs cases, counselling/medical appointment referrals and support ticket routing with strict privacy separation.
- Library catalogue and borrowing integrations.

### Phase 4 — University finance
- Institution subscription invoices for approved university finance officers.
- Maker-checker approval for invoice creation and payments, clear invoice numbers, receipts and audit logs.
- Paystack server-side initialization, signed webhook verification, reconciliation and idempotency.
- Student school fees only after each institution signs off on fee schedules, payer identity, reconciliation ownership, refunds and dispute handling.

### Phase 5 — Campus intelligence and daily life
- Verified campus maps, entrances, accessible routes and emergency destinations.
- Official university services crawler with source freshness and human review.
- CampusPulse groups, events, societies, alumni and career opportunities.
- ShieldMind grounded in approved campus policies, academic information and service directories.

## Release and trust rules

- Staging first; never promote a migration or UI change just because a branch builds.
- Test each role against both allowed and denied operations, including cross-university access.
- Use synthetic test identities and never copy real student records into automated tests.
- Keep provider secrets in Supabase Edge Function secrets; never in the browser or GitHub.
- Do not activate a payment button until server verification, webhook reconciliation and receipt flows pass.
- Mark features as “planned” until the required backend, integrations and operational ownership exist.
