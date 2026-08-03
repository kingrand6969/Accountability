begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select category, object_key, definition
  from (
        select 'rate_limit_config' as category,
               tbl as object_key,
               jsonb_build_object(
                 'owner_column', owner_col,
                 'maximum_rows', max_rows,
                 'window_seconds', window_secs
               ) as definition
          from public.rate_limits
        union all
        select 'storage_bucket_config' as category,
               id::text as object_key,
               jsonb_build_object(
                 'public', public,
                 'file_size_limit', file_size_limit,
                 'allowed_mime_types', allowed_mime_types
               ) as definition
          from storage.buckets
        union all
        select 'official_challenge_config' as category,
               to_jsonb(challenge_row)->>'official_key' as object_key,
               jsonb_build_object(
                 'title', to_jsonb(challenge_row)->'title',
                 'metric', to_jsonb(challenge_row)->'metric',
                 'starts_at', to_jsonb(challenge_row)->'starts_at',
                 'ends_at', to_jsonb(challenge_row)->'ends_at',
                 'cadence', to_jsonb(challenge_row)->'cadence',
                 'difficulty', to_jsonb(challenge_row)->'difficulty',
                 'target', to_jsonb(challenge_row)->'target',
                 'rest_day_tokens', to_jsonb(challenge_row)->'rest_day_tokens'
               ) as definition
          from public.challenges as challenge_row
         where to_jsonb(challenge_row)->>'is_official' = 'true'
       ) as deterministic_rows
 order by case category
           when 'rate_limit_config' then 1
           when 'storage_bucket_config' then 2
           when 'official_challenge_config' then 3
           else 4
          end,
          object_key;

rollback;
