# CampusShield AI — agent instructions

## Cloudflare tooling

- When interacting with Cloudflare, use the official `cf` CLI unless this project contains a Wrangler configuration file (`wrangler.jsonc`, `wrangler.json`, or `wrangler.toml`). If one exists, use Wrangler for that Workers project and do not migrate it automatically.
- Before a Cloudflare CLI operation, check that `cf` is installed and authenticated. Find commands with `cf cli search`, inspect the selected command with `cf schema`, and prefer current Cloudflare documentation over remembered syntax.
- For account-level changes that the CLI cannot perform, use the approved Cloudflare API/MCP connection and inspect the relevant API schema before making changes.
- Never put Cloudflare API tokens, Turnstile secrets, or other credentials in source files, Git history, pull-request text, logs, or chat. Use the platform's secret manager or an ignored local environment file.
- Do not create or deploy Workers, change DNS, WAF, access policies, production zones, or production Turnstile settings without explicit approval.

## CampusShield release and architecture constraints

- Preserve the existing Vercel hosting and Supabase backend. Do not replace either with Cloudflare Workers, D1, or another platform unless explicitly requested.
- Keep Cloudflare changes limited to approved edge/security features (for example, Turnstile or WAF) that fit the existing architecture.
- Follow staging-first release practice: implement and verify changes in staging first. Do not merge or deploy to production until required checks pass and production release is explicitly approved.
- Keep staging and production secrets, hostnames, and configuration separate. Never allow a staging credential or hostname in production configuration.
- Review diffs and run the relevant tests before proposing a merge.
