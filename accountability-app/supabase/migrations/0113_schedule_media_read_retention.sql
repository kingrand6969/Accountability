begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists media_read_log_created_at_idx
  on public.media_read_log (created_at, id);

create or replace function public.prune_media_read_log()
returns void
language sql
security definer
set search_path = ''
as $function$
  with doomed as (
    select id
    from public.media_read_log
    where created_at < pg_catalog.now() - interval '2 days'
    order by created_at, id
    limit 5000
  )
  delete from public.media_read_log as log
  using doomed
  where log.id = doomed.id;
$function$;

revoke all on function public.prune_media_read_log() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'prune-media-read-log',
  '*/5 * * * *',
  'select public.prune_media_read_log()'
);

select public.prune_media_read_log();

commit;
