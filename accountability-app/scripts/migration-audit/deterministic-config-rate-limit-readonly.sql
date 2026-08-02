begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select 'rate_limit_config' as category,
       tbl as object_key,
       jsonb_build_object(
         'owner_column', owner_col,
         'maximum_rows', max_rows,
         'window_seconds', window_secs
       ) as definition
  from public.rate_limits
 order by object_key;

rollback;
