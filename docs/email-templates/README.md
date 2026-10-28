# CampusShield AI email branding and sender identity

## Confirmation email template

Use `confirm-signup.html` in **Supabase → Authentication → Emails → Confirm sign up → Source**. Set the subject to:

`Confirm your CampusShield AI email address`

The template keeps `{{ .ConfirmationURL }}` unchanged. It uses the existing public PNG app icon because PNG is more reliable across email clients than SVG. The separate SVG asset remains available at:

`https://raw.githubusercontent.com/campusshield-ai/campusshield-ai/fix/email-logo-asset/icons/campusshield-email-logo.svg`

Save the template, use **Preview**, then send a new confirmation email to a Gmail inbox. Check that the image loads and that the confirmation link still returns to CampusShield. If the image is missing, test the public PNG URL in a new browser tab and check Gmail's “Display images” option.

## The grey Gmail sender avatar is a separate issue

The logo in the email body is not the avatar next to the sender. The screenshot shows the message arriving as a `brevosend.com` sender, while the configured sender address was a Gmail address. Brevo says free email domains such as Gmail cannot be authenticated as sending domains.

To improve sender identity:

1. In Brevo, open **Settings → Senders, Domains, IPs → Domains** and add/authenticate a domain you own, such as `campusshieldai.com` if its DNS is under your control.
2. Use only the DNS records that Brevo generates for your account. Add them with your domain DNS provider, then wait for Brevo to show the domain as authenticated.
3. Verify a sender such as `no-reply@campusshieldai.com` in Brevo, then update Supabase custom SMTP sender details to that verified address and the sender name `CampusShield AI`.
4. Send a test and inspect the message details to confirm the visible From address is the authenticated domain, not a `brevosend.com` address.

A branded Gmail inbox logo may require BIMI, including a properly authenticated sending domain, a DMARC policy, and a qualifying logo certificate. This is separate from adding an image to the email body. See Google's [BIMI setup guidance](https://knowledge.workspace.google.com/admin/security/set-up-bimi).

Do not paste SMTP passwords or SMTP keys into chat or into the email template. Keep them only in Supabase's SMTP settings.
