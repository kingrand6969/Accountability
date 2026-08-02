begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select 'postgres_server_version' as category,
       'server' as object_key,
       jsonb_build_object(
         'server_version_num', current_setting('server_version_num')
       ) as definition;

rollback;
