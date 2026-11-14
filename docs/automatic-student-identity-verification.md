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
