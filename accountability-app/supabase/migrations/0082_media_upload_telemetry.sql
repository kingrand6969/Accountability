-- 0082: privacy-minimal media-provider telemetry.
-- Records only provider/outcome/size so R2 outages or costly Supabase fallbacks
-- cannot remain invisible. No object key, URL, caption, filename or media bytes.

create table if not exists public.media_upload_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('r2', 'supabase')),
  kind text not null check (kind in ('avatar', 'cover', 'post')),
  outcome text not null check (outcome in ('success', 'fallback', 'rejected', 'failed')),
  bytes bigint not null check (bytes > 0 and bytes <= 12582912),
  failure_class text check (
    failure_class is null or failure_class in ('availability', 'auth', 'validation', 'quota', 'rate_limit', 'unknown')
  ),
  created_at timestamptz not null default now()
);

alter table public.media_upload_events enable row level security;

drop policy if exists media_upload_events_insert_own on public.media_upload_events;
create policy media_upload_events_insert_own on public.media_upload_events
  for insert to authenticated with check (user_id = auth.uid());

create index if not exists media_upload_events_created_idx
  on public.media_upload_events (created_at desc);
create index if not exists media_upload_events_provider_created_idx
  on public.media_upload_events (provider, created_at desc);

insert into public.rate_limits (tbl, owner_col, max_rows, window_secs)
  values ('media_upload_events', 'user_id', 180, 3600)
  on conflict (tbl) do update
  set owner_col = excluded.owner_col,
      max_rows = excluded.max_rows,
      window_secs = excluded.window_secs;

drop trigger if exists rl_enforce on public.media_upload_events;
create trigger rl_enforce before insert on public.media_upload_events
  for each row execute function public.enforce_rate_limit();

create or replace function public.admin_media_upload_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_assert();
  return json_build_object(
    'last_24h', (
      select coalesce(json_object_agg(provider || '_' || outcome, n), '{}'::json)
      from (
        select provider, outcome, count(*)::int as n
        from public.media_upload_events
        where created_at >= now() - interval '24 hours'
        group by provider, outcome
      ) x
    ),
    'last_30d_bytes', (
      select coalesce(json_object_agg(provider, bytes), '{}'::json)
      from (
        select provider, sum(bytes)::bigint as bytes
        from public.media_upload_events
        where created_at >= now() - interval '30 days'
        group by provider
      ) x
    ),
    'rejected_24h', (
      select count(*)::int from public.media_upload_events
      where created_at >= now() - interval '24 hours'
        and outcome in ('rejected', 'failed')
    ),
    'generated_at', now()
  );
end $$;

grant execute on function public.admin_media_upload_stats() to authenticated;
