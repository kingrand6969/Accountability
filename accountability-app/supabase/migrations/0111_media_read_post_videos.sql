begin;

alter table public.media_read_log
  drop constraint if exists media_read_log_media_kind_check;

alter table public.media_read_log
  add constraint media_read_log_media_kind_check
  check (media_kind in (
    'avatars',
    'covers',
    'post-images',
    'post-videos',
    'voice-encouragements'
  ));

commit;
