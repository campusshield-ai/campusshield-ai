# CampusShield AI email confirmation codes

CampusShield supports Supabase email confirmation using a one-time code. This avoids relying on a clickable Supabase confirmation URL that an email provider may rewrite through its click-tracking redirect.

## Configure staging first

Supabase staging project: `hywcpnoqqhxvujnimhxl`

1. Open the staging project in Supabase Dashboard.
2. Go to **Authentication → Email Templates → Confirm signup**.
3. Set the subject to `Your CampusShield AI confirmation code`.
4. Replace the confirmation-link body with this code-only template:

```html
<h2>Confirm your CampusShield AI account</h2>
<p>Enter this one-time code in the CampusShield AI page where you created your account:</p>
<p style="font-size:28px;font-weight:800;letter-spacing:6px;">{{ .Token }}</p>
<p>Never share this code. If you did not request this account, you can ignore this email.</p>
```

Do not include `{{ .ConfirmationURL }}` or a clickable authentication link in this template. Save the template.

## Staging test before production

1. Use the staging preview site and a new test email address you control.
2. Create an account, receive the email, enter the code in CampusShield, and verify that the account confirms and sign-in completes.
3. Test the resend-code path and invalid/expired-code messaging.
4. Only after those end-to-end checks pass, apply the same template to production Supabase project `fvgtnujjnvdkhzqqcaqe`.

Do not change the production template until the staging test passes. Password-reset and other authentication templates are separate and should not be changed as part of this signup-confirmation fix.
