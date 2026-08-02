begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

select 'ledger_version' as category,
       version::text as object_key,
       jsonb_build_object('version', version::text) as definition
  from supabase_migrations.schema_migrations
 order by version::text;

rollback;
