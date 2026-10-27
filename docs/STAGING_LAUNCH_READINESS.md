# CampusShield AI — launch readiness and owner confirmations

**Current state:** development/staging only. PR #113 is a draft. Do not merge or deploy to production until the authenticated staging E2E test passes and the operator-approved legal/provider details below are complete.

## 1. Staging authenticated E2E workflow

The workflow validates that the API URL is exactly the staging project `hywcpnoqqhxvujnimhxl` before it can write anything. It uses a public publishable key already present in `supabase-config.js`; the only GitHub secret required is:

- `SUPABASE_STAGING_SERVICE_ROLE_KEY` — the **staging project's** service-role secret key.

Set it in [GitHub repository Actions secrets](https://github.com/campusshield-ai/campusshield-ai/settings/secrets/actions) using **New repository secret**. Do not paste the key into issues, PR comments, source code, or this chat. Do not use the production service-role key.

The latest E2E attempt stopped at preflight because this repository secret was empty. It did **not** create synthetic users, upload files, or change database rows. After configuring the secret, trigger the branch workflow by committing a small change to one of the paths watched in `.github/workflows/staging-identity-e2e.yml` (or use **Run workflow** if GitHub offers the branch workflow in Actions).

The E2E harness is designed to:
1. Generate unique synthetic student and reviewer accounts, and confirm them through Supabase's token verification API **without sending an email**.
2. Exercise student role RPC authorization and upload a synthetic, non-personal PDF with the student JWT.
3. Check identity submission, student permission denial, administrator rejection, resubmission, and administrator approval using authenticated sessions.
4. Delete only this run's tagged synthetic accounts, records, and uploaded files in staging.

This flow tests the confirmation token and authenticated workflow, **not actual SMTP delivery**. After it passes, separately test the confirmation email with a controlled inbox you own, and never send test mail to an unrelated address. Review cleanup output before re-running after any failure.

## 2. Responsive browser/device checks

The Playwright workflow emulates phone, iPad portrait/landscape, laptop and desktop viewports, switches between sign-in/create-account, checks for horizontal overflow, and saves screenshots. These are browser viewport tests, not certification on physical devices. Test on a real phone and iPad before public launch, including:
- portrait and landscape orientations;
- keyboard open while entering credentials and completing the longer signup form;
- scrolling to the final submit button, password reset and confirmation controls;
- signup confirmation opened in a separate browser tab/device.

The tests also include a short-landscape check to ensure the sign-in submit action is not trapped below a clipped, nested scroll region.

## 3. Operator/legal details — must be supplied by the actual operator

The repository does not verify these facts. Do not fill them with guessed data.

- [ ] Exact service operator/legal entity name as used in official registration documents. If there is no registered entity, state the responsible owner/operator accurately instead of implying incorporation.
- [ ] Registration jurisdiction and registration number, **only if applicable**, and the official business/registered address that should be published.
- [ ] Designated privacy/data-protection contact and a monitored contact address.
- [ ] Operator-approved lawful-purpose/basis descriptions for account creation, identity verification, incident reporting, community features, AI processing, payments and notifications.
- [ ] Retention/deletion schedule by category: Auth accounts/profile, identity documents and review audit trail, incidents/evidence, community content, support requests, payments, logs and backups. Each rule needs a retention period or trigger, the authorized approver, deletion method, and any legal/safety hold. Current code/repository review did not establish one universal fixed period; the published privacy notice intentionally does not promise a made-up deadline.
- [ ] Review the Privacy Notice and Terms with the actual operator/legal adviser for the jurisdiction and the current product behavior before production release.

## 4. Verify the real production provider configuration

Code can indicate possible integrations, but it cannot prove which settings/contract apply in production. Check the actual production dashboards and record the result in the internal launch checklist:

- [ ] Supabase project, selected region, Auth email provider/SMTP vendor, backup/log retention, Storage policies, access to identity documents, and the retention/erasure procedure.
- [ ] Vercel and GitHub Pages hosting/deployment setup and relevant request/build logs.
- [ ] OpenAI API account and terms if ShieldMind AI is enabled; document what user context can be sent.
- [ ] Paystack merchant account, payment data handled by the app, and reconciliation/retention path if billing is enabled.
- [ ] Google OAuth configuration and provider terms if Google sign-in is enabled.
- [ ] Web-push/browser platform services if background notifications are enabled.
- [ ] Provider privacy notices, data-processing terms, data residency, subprocessors and any cross-border-transfer requirements that apply to the actual operator.

The website's Privacy Notice describes providers visible from the current code and explicitly says that optional services may not be enabled. Update it only after these facts are confirmed.

## 5. TikTok profile

The UI currently opens TikTok search for “CampusShield AI” and labels it as search; it does not claim that search results are an official account. No official profile URL was verifiable from the project links available during this review.

- [ ] The account owner supplies or confirms the exact TikTok profile URL.
- [ ] Verify that the profile is controlled by CampusShield AI before replacing the search link with an official-profile label.

## 6. Release decision

Release stays blocked until:
- [ ] authenticated staging E2E and cleanup pass;
- [ ] confirmation delivery is separately tested using a controlled inbox;
- [ ] actual operator/legal and retention details are approved and reflected here and in the public notices;
- [ ] production providers/configuration are checked;
- [ ] physical phone and iPad smoke tests are completed;
- [ ] staging preview is approved and PR #113 is reviewed before merging.

Production Supabase schema/Auth settings have not been intentionally changed as part of this work.
