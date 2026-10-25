# CampusShield AI staging Web Push setup

This setup is for the **staging** Supabase project only. Do not copy its secrets to production or commit any private key into Git.

## 1. Generate an application-server key pair

Run this on your own computer in a terminal:

```bash
npx web-push generate-vapid-keys --json
```

Keep the private key secret. The public key is used by the browser; the private key is only used by the Edge Function. Do not paste either key into source files, issue comments, or chat.

## 2. Set staging Edge Function secrets

In the Supabase Dashboard, open the staging project `hywcpnoqqhxvujnimhxl`, then open **Edge Functions → Secrets** and add these values:

| Secret | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | The generated public key |
| `VAPID_PRIVATE_KEY` | The generated private key |
| `VAPID_SUBJECT` | A real, monitored contact URI, usually `mailto:your-admin-contact@example.com` (replace with your actual address) |
| `CAMPUSSHIELD_APP_ORIGIN` | The exact HTTPS origin of your staging preview, e.g. `https://your-preview-host.example` (no path or trailing slash) |

For the browser-initiated self-test and new-message notification, the dispatcher validates the signed-in user token. For trusted server-originated dispatches, also set:

| Secret | Value |
|---|---|
| `PUSH_DISPATCH_SECRET` | A long, random value generated locally and shared only with trusted server-side callers |

Never expose `PUSH_DISPATCH_SECRET` to browser JavaScript.

If the app is served from a non-root path on the preview host, also set `CAMPUSSHIELD_APP_PATH` to that path (for example `/preview/`). The current GitHub Pages app path is `/campusshield-ai/campusshield-ai/`.

## 3. Allow the exact staging redirect

In the same staging project, open **Authentication → URL Configuration**. Add the exact staging-preview URL to the Redirect URLs allow-list (use a wildcard only if it is limited to the specific preview host/path you control). Keep the live production URL configured separately. The client requests a redirect to the page that initiated signup/resend.

Reference: https://supabase.com/docs/guides/auth/redirect-urls

## 4. Verify after configuration

1. Open the staging preview over HTTPS and sign in with a synthetic test account.
2. In Profile Settings, choose **Enable notifications on this device** and grant browser permission.
3. Choose **Send test notification** and confirm the operating system displays the generic test alert.
4. Open two synthetic, eligible accounts with an accepted private-message conversation. Enable notifications on the recipient account, send a test message, and verify the recipient gets a generic notification without message text.
5. Turn notifications off and verify the subscription is removed. Test on each supported desktop/mobile browser separately.

Until the VAPID secrets are present and the authenticated browser test succeeds, Web Push is implemented in staging but not verified end-to-end. The subscription and delivery tables have RLS enabled and no direct anon/authenticated table access.
