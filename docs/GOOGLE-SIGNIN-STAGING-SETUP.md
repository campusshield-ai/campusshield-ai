# Google sign-in for CampusShield AI — staging only

Project: Supabase staging `hywcpnoqqhxvujnimhxl`.

## What code is ready
- Sign-in includes a Google button only when the front end selects the staging Supabase project.
- Clicking it verifies the staging Auth provider status, then uses `supabase.auth.signInWithOAuth({ provider: "google" })`.
- The current preview URL is the return URL. Google OAuth status and redirect URIs are intentionally not hard-coded as secrets.
- Google-created accounts must remain pending students until the existing onboarding/verification workflow approves them. Google email/name data does not grant staff, administrator, identity-approved or campus-membership status.
- Production Supabase project `fvgtnujjnvdkhzqqcaqe` is untouched.

## Complete the external credentials setup

### 1. Create the Google OAuth Web client
Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients) and create an OAuth Client ID of type **Web application**.

For local preview, add the JavaScript origins actually used by your local server. Known project preview ports include:
- `http://127.0.0.1:5500`
- `http://localhost:5500`
- `http://127.0.0.1:5501`
- `http://localhost:5501`

Add this **Authorized redirect URI** exactly:
```
https://hywcpnoqqhxvujnimhxl.supabase.co/auth/v1/callback
```
Save the client ID and client secret. Do not put the client secret in the repository or browser code.

### 2. Enable the Google provider in Supabase staging
Open [Staging → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/hywcpnoqqhxvujnimhxl/auth/providers?provider=Google).

Enable Google and enter the Google Web Client ID and Client Secret. Save.

### 3. Allow the local return URLs in Supabase Auth
Open [Staging → Authentication → URL Configuration](https://supabase.com/dashboard/project/hywcpnoqqhxvujnimhxl/auth/url-configuration).

Add the local preview return URLs that you will actually use, e.g.:
- `http://127.0.0.1:5500/**`
- `http://localhost:5500/**`
- `http://127.0.0.1:5501/**`
- `http://localhost:5501/**`

Keep the production site URL and production Google provider settings unchanged. Do not add the production app as the target for this staging test.

### 4. Test with fictional staging accounts
- Open the locally served branch where `supabase-config.js` selects staging.
- Click **Continue with Google**, pick a test Google account, and complete the consent flow.
- A new account must land in pending onboarding; it must not become a verified student, teacher or administrator from Google claims alone.
- Complete campus onboarding and student identity review using synthetic records before attempting restricted features.
- Test an existing verified account, cancellation, provider-disabled messaging, and an institution-name mismatch.
- Check Supabase Auth logs and browser console for errors. Do not paste client secrets or real student ID details into chat.

## Current status
The source code and staging profile-name migration are prepared/applied. The Google provider itself cannot be activated until the owner creates a Google OAuth Client ID/secret and enters them directly in the staging dashboards above. This is intentionally left unconfigured rather than inventing credentials. No production changes or public release.
