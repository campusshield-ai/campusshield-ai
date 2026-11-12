# CampusShield account lifecycle

## Account deactivation

A non-administrator user can request deactivation from **My Profile → Sign-in & security**. The request is explicit and confirmed. It immediately bans the Auth account, revokes all refresh sessions, and records an exact 90-day recovery deadline in `public.account_lifecycle`.

A normal deactivation does not set `auth.users.deleted_at` and does not call `auth.admin.deleteUser`. That is important: Supabase documents Auth soft deletion as irreversible.

## Reactivation

A user who changes their mind contacts CampusShield support before the deadline. A trusted platform administrator opens **Platform administration → Account deactivation & recovery**, reviews the request and selects **Reactivate**. The existing password remains in place; the Auth ban is lifted and the lifecycle record returns to active.

The sign-in page provides the support route. Administrator accounts and trusted platform administrator IDs cannot be deactivated through the user flow or purged by the scheduled task.

## Permanent deletion

Supabase Cron runs the purge once every minute. It only selects deactivated accounts whose `purge_after` has elapsed. The purge removes the account's owned Storage objects and the known RESTRICT-linked classroom/audit rows before deleting the Auth user. Cascading foreign keys remove associated account data.

If an unexpected foreign-key dependency blocks deletion, the lifecycle state becomes `purge_blocked`, the error is recorded for administrator review, and the account stays banned. The job retries on subsequent daily runs rather than pretending deletion succeeded.

## Legacy accounts

The previous launch cleanup used Supabase Auth's soft-delete state. Supabase documents `deleteUser(id, true)` as not reversible. The migration records those legacy accounts with `legacy_soft_deleted=true`; the admin interface does not offer a false restore option for them. They retain the 90-day purge deadline based on their existing `deleted_at` timestamp.

## Production rollout

1. Run the account lifecycle migration on Staging.
2. Deploy the `account-lifecycle` Edge Function to Staging with JWT verification enabled.
3. Verify the account lifecycle static checks and staging role tests.
4. Merge the PR, then apply the same migration and deploy the Edge Function to Production.
5. Verify the scheduled job and the support/restore workflow before announcing the feature.
