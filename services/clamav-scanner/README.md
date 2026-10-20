# Private ClamAV scanner gateway for CampusShield AI

This service is designed to run under your control. Student identity documents are sent to this gateway only after being placed in Supabase's private quarantine bucket. Do not use a public file-scanning upload service for real student IDs.

## What it does

- Requires a bearer token.
- Accepts only JPEG, PNG, and PDF bytes up to 5 MiB.
- Validates file signatures independently of the browser's filename/MIME claims.
- Sends the file to a ClamAV daemon using the INSTREAM protocol.
- Returns `{"status":"clean","sha256":"..."}` only when ClamAV returns `OK`, or `{"status":"infected","sha256":"..."}` when ClamAV returns `FOUND`. The Edge Function verifies the response hash matches the submitted bytes.
- Returns an error when the scanner is unavailable; the Supabase function fails closed and leaves the file quarantined.
- Does not publish the ClamAV port. Put the scanner API behind an HTTPS reverse proxy or a private, authenticated network path before connecting Supabase to it.

## Deploy

1. Deploy this directory to a server you control with Docker Compose.
2. Generate a strong random token (at least 32 random bytes) and set it as `MALWARE_SCANNER_TOKEN` in the server's environment. Do not commit it.
3. Run `docker compose up -d --build`. First startup can take several minutes while ClamAV downloads virus definitions.
4. Configure an HTTPS reverse proxy/private endpoint for `scanner-api:8080`. Do not expose port 3310. Restrict the endpoint to the Supabase Edge Function's network path where feasible.
5. Test `GET /health` through the protected deployment. The health endpoint does not perform a malware scan; a real scan is confirmed only by a POST to `/scan`.
6. In the **staging** Supabase project, set Edge Function secrets:
   - `MALWARE_SCANNER_URL=https://YOUR-PRIVATE-SCANNER-HOST/scan`
   - `MALWARE_SCANNER_TOKEN=the-same-random-token`
7. Keep the URL on HTTPS. Never use production credentials or configure this on production until staging tests are complete.

The Edge Function sends raw bytes with `Content-Type` and `X-File-SHA256` headers. This API contract is intentionally small and does not retain uploaded file contents. Configure server logs to avoid request-body logging.

## Verification checklist

- A valid synthetic JPEG/PNG/PDF with ClamAV running returns `status: clean` only if ClamAV says `OK`.
- The standard harmless EICAR test signature embedded inside a synthetic, valid-header PDF must return `status: infected` (use only the standard test signature; never use live malware).
- Wrong bearer token returns 401.
- Unsupported MIME, invalid signature, empty file, and files over 5 MiB are rejected.
- Stop ClamAV and confirm the API returns 503; the Supabase function must not promote the quarantined file.
- Never test with a real student ID until the privacy notice, retention rules, scanner endpoint, and authorization have been reviewed.
