# Nigeria-wide university verification research and integration plan

## National directory baseline

The National Universities Commission's Nigerian University System directory currently reports:
- 77 federal universities
- 69 state universities
- 182 private universities
- 328 active universities in total

CampusShield's Staging public.campus_universities table currently contains 330 rows: 328 active, uniquely named institutions and two inactive historical rows. Among the 328 active records, 192 have an official website populated and 136 do not. The database has no verified student email-domain registry yet.

The NUC directory is the authoritative starting point for institution identity and official websites. It does not publish all student email domains or a common student-verification API for every institution.

## Strongest national integration lead: NERD / Federal Ministry of Education

Sources reviewed:
- Federal Ministry of Education, 6 March 2026 announcement (last updated 9 September 2026): https://education.gov.ng/fg-deploys-national-education-data-repository-to-end-certificate-fraud-strengthen-academic-records-integrity/
- NERD National Policy: https://www.ned.gov.ng/resources/NERD_national_policy.pdf
- NERD official repository site: https://databank.ned.gov.ng/
- Matriculation verification portal: https://matricdata.education.gov.ng/en
- Graduate verification portal: https://graduatedata.education.gov.ng/en
- National Credential Verification Service marketing site: https://verify.ned.gov.ng/

The Ministry's 6 March 2026 announcement states that more than 250 tertiary institutions had been integrated for real-time credential verification at the time of publication. The NERD policy describes a National Credential Management and Verification System and mutually agreed API calls to tertiary-institution servers. It also describes national student identifiers and yearly records intended to provide evidence of continuous enrolment.

This is the best first partnership target for broad national coverage. However, it is not yet an available CampusShield integration: the public matriculation/graduation portals show sign-in steps, not developer/API documentation. No public API base URL, authentication contract, sandbox credentials, rate limits or CampusShield partner agreement were found.

### Official contact routes to request partner access

- NERD Programme Secretariat: secretariat@ned.gov.ng
- Federal Ministry of Education ICT Department: ict@education.gov.ng
- Ministry ICT phone: +234 816 3653 484
- Ministry ICT page: https://education.gov.ng/information-and-communication-technology-department/

Ask NERD/FME to confirm whether the service supports current active-enrolment checks (not only completed degree verification), provide the authorised operator/API documentation, sandbox and contract, and explain student-consent, data minimisation, retention/deletion, audit, pricing and data-location requirements.

The page at verify.ned.gov.ng advertises a National Credential Verification Service and REST API. Treat it as a lead only until NERD/FME confirms its operator, legal mandate, data sources, endpoint and right to process student records in writing.

## University-issued email as a sign-up option

Students can use their institution-issued student email as their CampusShield account email, including a university Google Workspace/Gmail mailbox. Supabase's normal email confirmation verifies that the applicant can access that mailbox. A personal email remains acceptable when the institution does not provide one or the student cannot access it.

This is a supporting identity signal, not a standalone enrolment approval. Email verification proves mailbox control; it does not guarantee current student status. The applicant must continue through the existing matriculation and ID verification flow unless an authorised national or university system independently confirms enrolment.

Do not infer a student email domain from a public university website. Do not approve all .edu.ng or .ac.ng addresses, and do not use wildcard subdomains. A university's ICT unit or Registry must confirm the exact student domain and whether accounts are issued after registration and disabled promptly after graduation/withdrawal before that domain is eligible for any high-assurance verification rule.

Examples of official ICT information reviewed:
- Sule Lamido University ICT accounts/email: https://ict.slu.edu.ng/services/accounts.html — states student email accounts are tied to registration and accounts are closed when a student graduates or leaves.
- Akwa Ibom State University Directorate of ICT: https://aksu.edu.ng/web/directorate-of-ict/ — describes official student/staff email accounts and single sign-on.
- University of Ibadan IT and Media Services policy: https://ui.edu.ng/sites/default/files/2025-06/ITeMS%20policy%20including%20elearning-%20edited%20ecopy.pdf — describes official email accounts for university community members.

These examples show that policies and account lifecycles can differ. They do not establish domains or lifecycle guarantees for all 328 universities.

## Per-university fallback

Where NERD cannot yet return a verified record, obtain written authorisation from each university's ITDS/ICT Directorate and Registry. Request a supported service-to-service API, sandbox, active-enrolment semantics, provider reference, revocation procedure, and a data-processing agreement. Never scrape UMIS/student portals, reuse cookies, automate student logins or infer private endpoints from browser traffic.

## Required response contract for a national verifier

Before automatic approval is enabled, the approved service must return:
- exact canonical university identifier;
- a positive identity/student-number match;
- an explicit active-enrolment status for the current academic session;
- a verifiable provider transaction reference and timestamp;
- documented outcomes for leave, deferment, suspension, withdrawal and graduation;
- an authenticated response and documented error/timeout behaviour.

CampusShield must retain manual review for missing, ambiguous, stale, duplicate, revoked or unavailable records. University email verification alone does not promote a profile to verified status. Staff, teacher, finance, security and administrator roles are excluded from student auto-approval.

## Release order

1. Reconcile the 328 active NUC institution records and enrich the 136 missing official websites from authoritative sources.
2. Collect university-issued student email domains only from published ICT/Registry evidence or written authorisation; keep them exact and evidence-linked.
3. Secure the NERD partner API contract and sandbox.
4. Implement a dedicated national-provider adapter without weakening the current strict approval checks.
5. Run genuine, duplicate, mismatch, expired, withdrawn, deferred, revoked and unavailable test cases in Supabase Staging.
6. Perform privacy/security review and only then consider Production promotion.
