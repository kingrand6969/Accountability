begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '1s';

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts'
      and column_name = 'client_operation_id'
  ) as client_operation_column,
  to_regclass('public.posts_user_client_operation_unique') is not null
    as client_operation_index,
  (
    select count(*) = 6
    from information_schema.columns
    where table_schema = 'public' and table_name = 'challenges'
      and column_name in (
        'is_official', 'official_key', 'cadence', 'difficulty', 'target', 'rest_day_tokens'
      )
  ) as challenge_columns,
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public' and table_name = 'challenges'
      and column_name = 'creator_id'
  ) as creator_nullable,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_participants'
      and column_name = 'timezone_offset'
  ) as timezone_offset,
  to_regprocedure('public.refresh_official_challenges()') is not null
    as refresh_function,
  has_function_privilege(
    'authenticated', 'public.refresh_official_challenges()', 'EXECUTE'
  ) as refresh_authenticated,
  not has_function_privilege(
    'anon', 'public.refresh_official_challenges()', 'EXECUTE'
  ) as refresh_anon_revoked,
  (
    select pg_get_constraintdef(oid) like '%video%'
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_post_type_check'
  ) as video_constraint,
  (
    select pg_get_constraintdef(oid) like '%voice-encouragements%'
    from pg_constraint
    where conrelid = 'public.media_read_log'::regclass
      and conname = 'media_read_log_media_kind_check'
  ) as voice_constraint,
  (
    select count(*) = 2
    from pg_policies
    where schemaname = 'public' and tablename = 'challenges'
      and policyname in ('Creator edits challenge', 'Creator deletes challenge')
      and qual like '%NOT is_official%'
  ) as challenge_policies;

rollback;
