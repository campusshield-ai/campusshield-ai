# ShieldMind AI — staging provider setup

This guide applies **only** to the CampusShield AI staging Supabase project:

- Project ref: `hywcpnoqqhxvujnimhxl`
- Function: `shieldmind-chat`
- Production project `fvgtnujjnvdkhzqqcaqe` must remain unchanged.

## 1. Add the provider key to staging only

1. Create or use an OpenAI API key from the provider account you control. API usage may incur separate charges.
2. Open the [staging Edge Function Secrets page](https://supabase.com/dashboard/project/hywcpnoqqhxvujnimhxl/functions/secrets).
3. Add a secret with key `OPENAI_API_KEY` and paste the API key into its Value field. Save it.
4. Optionally add `SHIELDMIND_MODEL` with value `gpt-4.1-mini` to pin the configured model. If omitted, the function defaults to `gpt-4.1-mini`.
5. Do **not** put the provider key in `index.html`, `campusshield-backend.js`, `supabase-config.js`, GitHub commits, issues, pull-request comments, or chat messages. Do not add it to production.

Supabase documents that Edge Function secrets are available to functions immediately after saving; redeployment is not required: https://supabase.com/docs/guides/functions/secrets

## 2. What the function does before calling the provider

The deployed function requires a valid signed-in Supabase user, a verified profile, an active and verified campus membership, and approved student identity for student accounts. It also enforces the server-side quota of five requests per minute and 80 per UTC day per user. If the provider key is absent, it returns an explicit safe fallback and makes no provider request.

## 3. Acceptance checks after saving the secret

Use only fictional staging accounts and data.

- Sign in with an approved, verified staging account.
- Open ShieldMind and ask a harmless academic question, e.g. “Explain photosynthesis in three simple steps.”
- Confirm an answer is returned and that the status indicates provider-backed mode.
- Confirm an unverified/pending account cannot use the endpoint.
- Confirm a student without approved identity cannot use the endpoint.
- Confirm a non-member or unverified campus membership is rejected.
- Confirm official university policy, fee, and deadline questions do not get presented as verified facts; the approved source catalog is not connected yet.
- Confirm the function logs do not expose the provider key or private user data.

Do not run live-provider tests until a valid staging-only key is saved. Do not use real student IDs, incident reports, private Helpdesk records, attendance records, or medical information.

## 4. Release boundary

This remains a draft PR targeting `codex/signup-identity-review-staging`, not `main`. Do not merge or publish without explicit owner approval and a signed-in browser walkthrough.
