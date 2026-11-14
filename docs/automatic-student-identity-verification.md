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
