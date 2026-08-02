begin read only;
set local statement_timeout = '3s';
set local lock_timeout = '1s';

select 'ledger_presence' as category,
       'supabase_migrations.schema_migrations' as object_key,
       jsonb_build_object('relation', to_regclass('supabase_migrations.schema_migrations')::text) as definition;

rollback;
