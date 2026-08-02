begin read only;
set local statement_timeout = '3s';
set local lock_timeout = '1s';

select 'cron_job_config' as category,
       jobname as object_key,
       jsonb_build_object(
         'schedule', schedule,
         'command_sha256', encode(digest(command, 'sha256'), 'hex')
       ) as definition
  from cron.job
 order by object_key;

rollback;
