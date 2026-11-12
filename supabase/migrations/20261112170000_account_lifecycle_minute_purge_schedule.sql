-- Keep the permanent-deletion queue close to each account's 90-day deadline.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'campusshield-account-lifecycle-purge') then
    perform cron.unschedule('campusshield-account-lifecycle-purge');
  end if;
  if exists (select 1 from cron.job where jobname = 'campusshield-account-lifecycle-daily-purge') then
    perform cron.unschedule('campusshield-account-lifecycle-daily-purge');
  end if;
  perform cron.schedule(
    'campusshield-account-lifecycle-purge',
    '* * * * *',
    'select * from private.purge_expired_account_lifecycle();'
  );
end;
$schedule$;
