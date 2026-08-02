begin read only;
set local statement_timeout = '3s';
set local lock_timeout = '1s';

select 'cron_presence' as category,
       'cron.job' as object_key,
       jsonb_build_object('relation', to_regclass('cron.job')::text) as definition;

rollback;
