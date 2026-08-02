begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select 'current_state_flag' as category,
       '0051_buddy_messages_retain_false' as object_key,
       jsonb_build_object('present', exists(
         select 1 from public.buddy_messages where retain is false
       )) as definition
union all
select 'current_state_flag',
       '0067_profiles_location_verified_true',
       jsonb_build_object('present', exists(
         select 1 from public.profiles where location_verified is true
       ))
union all
select 'current_state_flag',
       '0074_profiles_display_name_unsanitized',
       jsonb_build_object('present', exists(
         select 1
           from public.profiles
          where display_name <> substring(
            btrim(regexp_replace(regexp_replace(display_name, '[<>[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')),
            1,
            60
          )
       ))
union all
select 'current_state_flag',
       '0078_posts_group_audience_mismatch',
       jsonb_build_object('present', exists(
         select 1 from public.posts where group_id is not null and audience <> 'group'
       ))
union all
select 'current_state_flag',
       '0078_posts_page_audience_mismatch',
       jsonb_build_object('present', exists(
         select 1 from public.posts where page_id is not null and audience <> 'public'
       ))
union all
select 'current_state_flag',
       '0078_posts_event_type_mismatch',
       jsonb_build_object('present', exists(
         select 1 from public.posts where event_id is not null and post_type <> 'event'
       ))
union all
select 'current_state_flag',
       '0078_posts_photo_type_mismatch',
       jsonb_build_object('present', exists(
         select 1
           from public.posts
          where event_id is null and image_url is not null and post_type = 'post'
       ))
order by object_key;

rollback;
