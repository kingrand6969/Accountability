create table if not exists public.post_encouragements (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  voice_ref text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint encouragement_content check (
    nullif(btrim(body), '') is not null or voice_ref is not null
  ),
  constraint encouragement_duration check (
    duration_ms is null or duration_ms between 250 and 10000
  ),
  constraint encouragement_voice_ref check (
    voice_ref is null or voice_ref ~ '^r2://voice-encouragements/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
  )
);

create index if not exists post_encouragements_post_created_idx
  on public.post_encouragements(post_id, created_at);

alter table public.post_encouragements enable row level security;

create policy encouragements_select on public.post_encouragements
  for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));

create policy encouragements_insert on public.post_encouragements
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_post(post_id, auth.uid())
  );

create policy encouragements_delete on public.post_encouragements
  for delete to authenticated
  using (user_id = auth.uid());

alter table public.media_read_log
  drop constraint if exists media_read_log_media_kind_check;

alter table public.media_read_log
  add constraint media_read_log_media_kind_check
  check (media_kind in ('avatars', 'covers', 'post-images', 'voice-encouragements'));
