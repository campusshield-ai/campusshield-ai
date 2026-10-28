# CampusShield AI email confirmation codes

CampusShield uses Supabase email confirmation with a one-time code. The code is entered in the app and verified with Supabase Auth, avoiding a clickable confirmation URL that an email provider may rewrite through click tracking.

## Configure staging first

Supabase staging project: `hywcpnoqqhxvujnimhxl`

1. Open the staging project in Supabase Dashboard.
2. Go to **Authentication → Email Templates → Confirm signup**.
3. Set the subject to `Your CampusShield AI confirmation code`.
4. Replace the current body with this branded, code-only template:

```html
<div style="margin:0;background:#f3f7f5;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#17313a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1eae5;border-radius:18px;padding:32px 24px;text-align:center;">
    <img src="https://campusshield-ai.github.io/campusshield-ai/icons/campusshield-512.png" width="76" height="76" alt="CampusShield AI logo" style="display:block;width:76px;height:76px;object-fit:contain;margin:0 auto 20px;border-radius:16px;" />
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:2px;color:#177b68;">CAMPUSSHIELD AI</p>
    <h1 style="font-size:25px;line-height:1.3;margin:0 0 14px;color:#102b35;">Confirm your email address</h1>
    <p style="font-size:15px;line-height:1.7;color:#52666c;margin:0 0 24px;">Welcome to CampusShield AI. Enter this one-time code in the CampusShield page where you created your account.</p>
    <div style="display:inline-block;background:#edf8f4;border:1px solid #cfe9df;border-radius:14px;padding:18px 24px;margin:0 0 22px;">
      <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:7px;color:#087f6b;">{{ .Token }}</p>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#71828a;margin:0 0 18px;">This code is for confirming your email address. Never share it with anyone.</p>
    <p style="font-size:12px;line-height:1.6;color:#71828a;margin:0;">If you did not request a CampusShield AI account, you can ignore this email.</p>
    <p style="font-size:11px;color:#8a999c;margin:22px 0 0;">CampusShield AI · Intelligent Campus Safety</p>
  </div>
</div>
```

This layout keeps the logo, teal accents, and branded card while using only `{{ .Token }}` for confirmation. Do **not** add `{{ .ConfirmationURL }}` or another clickable verification link, because that may reintroduce the broken Brevo tracking redirect.

## Staging test before production

1. Use the staging preview site and a new test email address you control.
2. Create an account, receive the email, enter the code in CampusShield, and verify that the account confirms and sign-in completes.
3. Test the resend-code path and invalid/expired-code messaging.
4. Only after those end-to-end checks pass, apply the same template to production Supabase project `fvgtnujjnvdkhzqqcaqe`.

Do not change the production template until the staging test passes. Password-reset and other authentication templates are separate and should not be changed as part of this signup-confirmation fix.
