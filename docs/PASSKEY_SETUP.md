# Passkeys and biometric sign-in — staging architecture

CampusShield uses Supabase Auth passkeys (WebAuthn) for the website/PWA. The device or passkey provider may ask for Face ID, Touch ID, fingerprint, Windows Hello, device PIN, or a security key. CampusShield must not request, upload, or store raw biometric data. Supabase Auth stores the public-key credential and verifies the signed challenge; the private key remains with the authenticator.

## Staging rollout prerequisites

1. Use a stable HTTPS staging hostname. The staging Vercel project now has the stable alias `https://campusshield-ai-staging-preview.vercel.app` assigned to the Help & Feedback/passkey feature preview. Use this origin for passkey testing rather than transient deployment URLs such as `...-<hash>.vercel.app`.
2. In the **staging Supabase project only** (`hywcpnoqqhxvujnimhxl`), open Authentication → Passkeys and enable passkey authentication.
3. Configure these staging-only WebAuthn values: Relying Party Display Name `CampusShield AI Staging`; Relying Party ID `campusshield-ai-staging-preview.vercel.app` (hostname only, no scheme/path); Relying Party Origins `https://campusshield-ai-staging-preview.vercel.app`. Do not use the public-suffix domain `vercel.app` itself. Keep the relying-party ID stable after enrolment.
4. The client loads Supabase JS v2 and opts into the experimental passkey API. If the project has passkeys disabled or the API/origin is misconfigured, the UI shows an actionable message and keeps email/password sign-in available.
5. Validate on real iPhone Safari (Face ID/Touch ID), Android Chrome (platform authenticator), and a desktop browser with a passkey provider. Also test cancelled prompts, unsupported devices, sign-out, passkey removal, and password fallback.
6. Only after those checks pass should the production Supabase project be configured separately for the canonical production domain. Do not change production Auth settings as part of staging.

## Account controls

- Enrolment is optional and requires an already authenticated, confirmed account.
- “Enable passkey sign-in” registers a passkey. “Disable” removes all passkeys on that account after a confirmation prompt.
- The password fallback remains available regardless of passkey state.
- UI may display passkey provider metadata and timestamps only; never device biometric material.
