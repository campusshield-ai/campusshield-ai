# TORIO staging on Cloudflare Pages

This guide creates a separate **staging-only** preview host for the existing static CampusShield AI/TORIO site. It does not replace GitHub Pages, the Vercel project, the production domain, or either Supabase project.

## Why this is isolated

- The current production hostname is `campusshield-ai.github.io`. `supabase-config.js` selects the production Supabase project only for that hostname.
- A Cloudflare Pages hostname (`*.pages.dev`) is not that production hostname, so the browser config selects the existing **staging** Supabase project.
- The Pages build uses `scripts/build-cloudflare-pages.mjs`. It copies only top-level HTML, JavaScript, CSS and webmanifest files plus `assets/` and `icons/`.
- The public payload deliberately excludes `.github/`, `supabase/`, `tests/`, `docs/`, `scripts/`, README files and repository metadata.
- No Supabase service-role key, Edge Function secret, Vercel token or other server secret belongs in Cloudflare Pages.

## Create the separate Pages project

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Connect GitHub and authorize access only to `campusshield-ai/campusshield-ai` where possible.
4. Select the `campusshield-ai/campusshield-ai` repository.
5. Name the Cloudflare project `torio-staging` (or another clearly staging-only name).

## Build configuration

Use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Production branch | `main` |
| Root directory | Repository root (leave blank) |
| Build command | `node scripts/build-cloudflare-pages.mjs` |
| Build output directory | `dist/torio-staging` |
| Build environment variable | `NODE_VERSION` = `22` |

The build script creates a curated static website payload. Do not set the output directory to `/`, `.` or the repository root; that would risk publishing repository-only files.

## Restrict deployments to preview only

After the first Pages project is created:

1. Open **Settings** → **Builds** → **Branch control**.
2. Keep `main` as the production-branch reference, but turn off **Enable automatic production branch deployments**.
3. Set Preview branch deployments to **Custom branches**.
4. Include only `feat/jarvis-command-interface` while TORIO is being tested.
5. Do not add a custom domain. Keep this project on its `pages.dev` host.

This makes the feature branch create a preview deployment without replacing the project's production branch or attaching a production hostname.

## Test the preview

Once Cloudflare reports a successful build for `feat/jarvis-command-interface`, open the branch's Preview URL and check:

- `/torio-command-center.html` loads and the TORIO manifest is reachable.
- Sign-in uses the staging Supabase project (the browser console reports `staging/development`).
- An authenticated staging account can use ShieldMind.
- Quick Ask, supported text-file attachments, guided flow, account-specific context, verify-answer, voice input and read-aloud behave correctly.
- The PWA can be installed in Chrome or Edge from the HTTPS preview URL.

Do not use real student records or production credentials in staging tests. Use the existing synthetic staging accounts and fictional test data.

## Release boundary

- Keep PR #142 open and in draft until the preview and authenticated tests pass.
- Do not change GitHub Pages settings, the production domain, production Supabase configuration or production Edge Function secrets.
- Do not copy Vercel secrets into Cloudflare. The browser needs only the existing public Supabase publishable key, and server credentials remain in Supabase Edge Function secrets.
- A Cloudflare Pages preview is a separate host, not a production launch.
