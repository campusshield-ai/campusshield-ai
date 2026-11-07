# CampusShield Vercel deployment policy

## Purpose

Limit automatic Vercel deployments to the two shared release branches. Feature branches remain available for GitHub pull requests and GitHub Actions checks, but do not each create a Vercel Preview deployment.

## Branch policy

| Git branch | Automatic deployment | Intended use |
|---|---:|---|
| `main` | Enabled | Production release branch |
| `staging/preview` | Enabled | Shared pre-production review branch |
| Every other branch | Disabled | Feature work and pull-request checks in GitHub Actions |

The root `vercel.json` implements this allowlist with `git.deploymentEnabled`:

- `**: false` disables unspecified branches, including feature branches with slash-separated names.
- `main: true` keeps the Production branch enabled.
- `staging/preview: true` keeps the shared review branch enabled.

Vercel uses minimatch branch patterns. When a branch matches more than one rule, a matching `true` rule takes precedence, so the two explicit shared branches remain deployable even though they also match `**`.

## Release workflow

1. Develop on a feature branch. Run the relevant GitHub Actions smoke and browser checks; Vercel feature-branch previews are intentionally disabled.
2. Open a pull request into `staging/preview`. Merge related, validated work in a small number of grouped releases rather than deploying every feature-branch commit.
3. Review the shared `staging/preview` deployment and run the Staging regression suite.
4. Open a pull request from `staging/preview` into `main`. Require the agreed Staging checks to pass before merging.
5. Merge into `main` to create the Production deployment.

Plan for one Vercel deployment on `staging/preview` and a separate Production deployment on `main` for each release. Do not rely on cross-environment commit reuse to reduce the deployment count.

## Important project-setting distinction

The current Vercel project has no custom environment configured. Therefore, the `staging/preview` branch currently creates a Preview deployment, not a separately named Vercel Custom Staging environment. The branch rule does not create or rename environments.

The Vercel project must keep `main` selected under **Settings → Environments → Production → Branch Tracking**. If a separately labelled Staging environment is required later, create that environment in Vercel and associate it with `staging/preview`; do not change the Production branch.

## Scope and safety

This policy only controls which Git branches trigger automatic Vercel deployments. It does not change application code, Supabase, environment variables, Paystack, domain aliases, deployment targets, student access, or data. It does not delete existing deployments.

Do not attempt a manual Production deployment while the account's deployment limit is active. After the limit is clear, verify the shared Staging deployment first, then merge to `main` and verify the Production alias.
