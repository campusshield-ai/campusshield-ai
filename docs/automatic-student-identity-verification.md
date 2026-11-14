# CampusShield automatic student identity verification

Automatic approval is allowed only after an authoritative university verifier confirms the credential and active enrolment. File signature, duplicate hash and malware scanning establish file safety, not document originality.

A student can be auto-approved only when:
1. The account email is confirmed and the student application and campus membership are pending/active at the selected institution.
2. The upload passes the existing malware scan and is stored in the private identity bucket.
3. The student explicitly opts in to send the ID and matric number to the configured university verifier.
4. The verifier confirms document authenticity, identity, active enrolment, student-number match and exact university match.
5. The matric number and file hash are not duplicated across another account.

Any missing configuration, missing consent, timeout, provider error, ambiguous result, duplicate signal, or unconfirmed email stays in manual review. Staff, teacher, security, admin and finance roles are never auto-approved.

## Staging-only provider secrets
- UNIVERSITY_ID_VERIFIER_URL: HTTPS endpoint owned by or formally authorised by the selected university.
- UNIVERSITY_ID_VERIFIER_TOKEN: private bearer token.
- UNIVERSITY_ID_VERIFIER_NAME: short provider label.

Keep these only in Supabase Edge Function secrets, never in browser code or Git.

## Provider HTTP contract
CampusShield POSTs multipart fields institution_name, university_id, student_number and student_id_document. The endpoint must return HTTP 200 JSON with all exact values:
```json
{
  "status": "verified",
  "identity_valid": true,
  "document_authentic": true,
  "active_enrollment": true,
  "student_number_match": true,
  "university_match": true,
  "university_id": "the-exact-university-uuid",
  "source_reference": "verifiable-reference-from-the-provider"
}
```
All five boolean fields must be exactly true, the university UUID must match, and source_reference must be 2-180 safe characters. Everything else is manual review.

## Privacy
The raw ID is forwarded only if the student checks the separate consent option. Without that consent it stays in CampusShield's private storage, having been sent only to the configured malware scanner. Confirm university authority, provider retention and data-processing terms before enabling.


## Babcock University pilot integration

Public Babcock resources identify:
- ITDS: https://ict.babcock.edu.ng/
- UMIS portal: https://umis.babcock.edu.ng/babcock/
- UMIS support documentation: https://support.babcock.edu.ng/docs/umis
- University Registry: https://www.babcock.edu.ng/registry

These public resources establish that UMIS holds academic/student records and that ITDS supports the university's academic and administrative systems. They do not publish an approved third-party student-record verification API or its authentication contract. Do not scrape the authenticated portal, replay browser sessions, automate student logins, or infer a private API from browser traffic.

Before enabling the Babcock verifier, obtain written authorisation from ITDS and the Registry. Request:
1. The official sandbox and production endpoint specifications.
2. A service-to-service authentication method and credential rotation procedure.
3. The exact student-number lookup and active-enrolment semantics, including leave, deferment, withdrawal and graduation states.
4. A provider reference that CampusShield can retain without storing unnecessary registry data.
5. Rate limits, timeout guidance, outage/error codes, support contact and revocation procedure.
6. A data-processing agreement, permitted purpose, retention/deletion schedule and approved hosting/data-transfer location.

Configure the approved endpoint hostname in `UNIVERSITY_ID_VERIFIER_ALLOWED_HOSTS` as an exact comma- or semicolon-separated allowlist (hostnames only, no wildcards or URL paths). The HTTPS verifier URL must use one of those exact hosts and port 443. An empty or non-matching allowlist keeps every submission in manual review.

## Babcock governance and privacy gate

The first implementation is deterministic: it sends an opt-in document and matric number to a university-authorised service and validates explicit boolean results. It is not a visual-AI authenticity detector. Do not add OCR/AI document scoring or automatic fraud classification to the Babcock pilot without the University's review.

Babcock publishes an AI policy at https://babcock.edu.ng/policies/artificial-intelligence-policy. Its published summary says a DPIA is completed before deploying AI systems that process student records, support decisions about individuals, or send personal data outside Nigeria. Confirm applicability with Babcock's DPO and ITDS before any AI-based extension or cross-border processing. Obtain privacy/legal approval for this deterministic verification integration too, including data minimisation, student notice/consent, retention, access logging and incident response.

Until ITDS/Registry authorisation and the University's privacy approval are documented, leave the verifier secrets unset. Student submissions continue to the normal campus administrator queue.


## National, Nigeria-wide verification route

The first national integration target should be the Nigeria Education Repository and Databank (NERD), coordinated through the Federal Ministry of Education, rather than trying to reverse-engineer 328 separate student portals.

Official public information reviewed:
- Federal Ministry of Education announcement (6 March 2026; page updated 9 September 2026): https://education.gov.ng/fg-deploys-national-education-data-repository-to-end-certificate-fraud-strengthen-academic-records-integrity/
- NERD National Policy: https://www.ned.gov.ng/resources/NERD_national_policy.pdf
- NERD policy contact: secretariat@ned.gov.ng
- Federal Ministry of Education ICT Department: https://education.gov.ng/information-and-communication-technology-department/ — ict@education.gov.ng, +234 816 3653 484
- Federal Ministry matriculation-record portal: https://matricdata.education.gov.ng/en
- Federal Ministry graduate-record portal: https://graduatedata.education.gov.ng/en

The Ministry's 6 March 2026 announcement says more than 250 tertiary institutions had been integrated for real-time credential verification at the time of publication. The NERD policy describes a national credential-verification system with mutually agreed API calls to institution servers and national records intended to support yearly evidence of continuous academic enrolment. This is a promising route for broad coverage, but it is not proof that CampusShield currently has API access.

The public matriculation and graduation portals expose sign-in workflows, not a public developer specification. No public CampusShield-ready API reference, sandbox URL, authentication schema, rate limits or service-level agreement was located during this review. Do not automate those portals or use personal credentials.

### NERD integration request

Contact the NERD Programme Secretariat and the Ministry ICT Department. Request:
1. Written confirmation that the NERD National Credential Management and Verification Service can verify a current student's active enrolment, not only a completed qualification.
2. Partner onboarding requirements for CampusShield AI and the responsible institutional/legal approvals.
3. API documentation, sandbox and test credentials, production onboarding, authentication and key rotation.
4. Query fields and matching rules (institution ID, matriculation number, student name and the minimum extra data required).
5. An explicit active-enrolment response covering current session, deferment, suspension, withdrawal and graduation.
6. A signed or otherwise independently verifiable transaction reference, timestamps, error codes, rate limits, uptime expectations and incident contacts.
7. A data-processing agreement covering purpose, minimisation, retention/deletion, hosting location, cross-border access, audit logs and student notice/consent.
8. Confirmation of the operator's authority, the relationship between the official NERD programme and any branded National Credential Verification Service portal, and the API provider that CampusShield would contract with.

A separate public site, https://verify.ned.gov.ng/, advertises a National Credential Verification Service and a REST API. Treat that page as a lead only: before sending student information or paying for queries, NERD/FME must confirm in writing that the operator, endpoint, data source, contract and student-record permissions are official and authorised for this purpose.

### Student university email route

Students may use an institution-issued student mailbox as their CampusShield sign-up email, including a university Google Workspace/Gmail account. The normal Supabase confirmation email verifies control of that mailbox. Students without an accessible university mailbox may use a personal email address and continue through the existing identity-document process.

Important limitations:
- A confirmed email proves access to the mailbox; it does not by itself prove that the account holder is currently enrolled.
- Do not infer student email domains from a university's public website domain. A university may use a different student subdomain, an external mail provider or no student email programme.
- Do not accept every .edu.ng or .ac.ng address as a verified student domain, and do not use wildcard subdomain matching.
- Only add an institution email domain after the university's ICT unit or Registry confirms the exact domain and the issuance/lifecycle policy in an official source or written authorisation.
- A domain can be eligible as an enrolment signal only if the institution confirms that student mailboxes are issued after admission/registration and disabled or revoked promptly when student status ends. Even then, retain a national/institutional record check for high-assurance automatic approval where available.
- A university-email match must never grant a teacher, staff, finance, security or administrator role.

Published university ICT policies show why this must be configured institution by institution. For example, Sule Lamido University's ICT service page says student accounts are tied to registration and are closed when students graduate or leave; Akwa Ibom State University's ICT page describes official student/staff email and single sign-on. These are useful examples, not a universal rule for every university.

### Coverage and directory quality

The NUC NUS directory reports 328 active universities: 77 federal, 69 state and 182 private. The CampusShield Staging campus_universities table currently has 328 active uniquely named records (plus two inactive historical rows). Only 192 active records have an official website populated; 136 still need official-site enrichment. There is currently no verified student-email-domain registry, and no domain should be assumed from the website field.

Next implementation stages:
1. Use the NUC NUS directory as the master institution list and reconcile changes through review, including new licences and renamed institutions.
2. Enrich missing official websites from NUC records and the institution's own official publication.
3. Create an evidence-backed email-domain register with exact domain, institution, evidence URL, reviewer, verification date, expiry/recheck date and mailbox lifecycle policy.
4. Integrate one NERD national adapter once an authorised API contract and sandbox are provided.
5. Retain institution-specific ITDS/Registry adapters as a fallback for universities not yet available through NERD.
6. Test real, duplicate, revoked, deferred, graduated, mismatched and unavailable records in Staging before any Production promotion.

Until an authorised national or university verifier is connected and tested, university email confirmation is only supporting evidence and all identity submissions continue through the existing manual-review fallback.
