# CampusShield AI staging Web Push setup

This setup is for the **staging** Supabase project only. Do not copy its secrets to production or commit any private key into Git.

## 1. Upload the staging secrets safely

From the repository root in Windows PowerShell:

```powershell
supabase login
.\scripts\setup-staging-push-secrets.ps1
```

The script is pinned to staging project `hywcpnoqqhxvujnimhxl`. It prompts for the exact preview origin, app path, and VAPID contact subject, then creates any missing keys locally, uploads the values with `supabase secrets set`, and deletes its restricted temporary secrets file. It does not print or commit secret values. It preserves an existing VAPID keypair and dispatch secret by default.

Only rotate a VAPID keypair intentionally, because subscribed devices may need to re-subscribe:

```powershell
.\scripts\setup-staging-push-secrets.ps1 -RotateVapidKeys
```

Do not use the production GitHub Pages host as the staging origin: `supabase-config.js` selects production for that host. Use your separate staging preview host. The script will show the redirect pattern to add to the staging Auth allow-list.

## 2. Add the staging authentication redirect

In the staging project, open **Authentication → URL Configuration** and add the redirect pattern printed by the script under **Redirect URLs**. Keep the production Site URL unchanged. Do not allowlist an untrusted host or use a wildcard wider than your controlled preview host/path.

Supabase reference: https://supabase.com/docs/guides/auth/redirect-urls

## 3. Verify after configuration

1. Open the staging preview over HTTPS and sign in with a synthetic test account.
2. In Profile Settings, choose **Enable notifications on this device** and grant browser permission.
3. Choose **Send test notification** and confirm the operating system displays the generic test alert.
4. Open two synthetic, eligible accounts with an accepted private-message conversation. Enable notifications on the recipient account, send a test message, and verify the recipient gets a generic notification without message text.
5. Turn notifications off and verify the subscription is removed. Test on each supported desktop/mobile browser separately.

Until the VAPID secrets are present and the authenticated browser test succeeds, Web Push is implemented in staging but not verified end-to-end. The subscription and delivery tables have RLS enabled and no direct anon/authenticated table access.
