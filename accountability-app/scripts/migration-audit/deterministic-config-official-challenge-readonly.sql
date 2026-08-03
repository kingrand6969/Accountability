begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

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
 order by object_key;

rollback;
