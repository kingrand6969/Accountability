-- Repair application invariants that the sealed 0001-0093 staging audit
-- proved absent. Hosted extension versions and platform-managed grants are
-- intentionally outside this migration.

begin;

alter table public.posts
  add column if not exists client_operation_id uuid;

create unique index if not exists posts_user_client_operation_unique
  on public.posts (user_id, client_operation_id)
  where client_operation_id is not null;

alter table public.challenges
  alter column creator_id drop not null,
  add column if not exists is_official boolean not null default false,
  add column if not exists official_key text,
  add column if not exists cadence text,
  add column if not exists difficulty text,
  add column if not exists target numeric,
  add column if not exists rest_day_tokens integer not null default 0;

alter table public.challenges
  drop constraint if exists challenges_official_key_key,
  drop constraint if exists challenges_cadence_check,
  drop constraint if exists challenges_difficulty_check,
  drop constraint if exists challenges_target_check,
  drop constraint if exists challenges_rest_day_tokens_check,
  drop constraint if exists challenges_owner_kind_check;

alter table public.challenges
  add constraint challenges_official_key_key unique (official_key),
  add constraint challenges_cadence_check
    check (cadence in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  add constraint challenges_difficulty_check
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  add constraint challenges_target_check check (target is null or target > 0),
  add constraint challenges_rest_day_tokens_check check (rest_day_tokens between 0 and 30),
  add constraint challenges_owner_kind_check check (
    (is_official and creator_id is null and official_key is not null)
    or
    (not is_official and creator_id is not null and official_key is null)
  );

alter table public.challenge_participants
  add column if not exists timezone_offset integer;

alter table public.challenge_participants
  drop constraint if exists challenge_participants_timezone_offset_check;

alter table public.challenge_participants
  add constraint challenge_participants_timezone_offset_check
    check (timezone_offset between -840 and 840);

drop policy if exists "Creator edits challenge" on public.challenges;
create policy "Creator edits challenge" on public.challenges
  for update using (not is_official and auth.uid() = creator_id)
  with check (not is_official and auth.uid() = creator_id);

drop policy if exists "Creator deletes challenge" on public.challenges;
create policy "Creator deletes challenge" on public.challenges
  for delete using (not is_official and auth.uid() = creator_id);

create or replace function public.refresh_official_challenges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('week', now());
  month_start timestamptz := date_trunc('month', now());
  year_start timestamptz := date_trunc('year', now());
begin
  insert into public.challenges
    (creator_id, title, metric, starts_at, ends_at, is_official, official_key,
     cadence, difficulty, target, rest_day_tokens)
  values
    (null, 'Show Up Today', 'consistency', day_start, day_start + interval '1 day',
     true, 'daily:' || day_start::date || ':beginner', 'daily', 'beginner', 1, 0),
    (null, 'Three-Day Foundation', 'consistency', week_start, week_start + interval '7 days',
     true, 'weekly:' || week_start::date || ':beginner', 'weekly', 'beginner', 3, 1),
    (null, 'Five-Day Momentum', 'consistency', week_start, week_start + interval '7 days',
     true, 'weekly:' || week_start::date || ':advanced', 'weekly', 'advanced', 5, 1),
    (null, 'Monthly 25K', 'distance', month_start, month_start + interval '1 month',
     true, 'monthly:' || month_start::date || ':beginner', 'monthly', 'beginner', 25, 2),
    (null, 'Monthly 75K', 'distance', month_start, month_start + interval '1 month',
     true, 'monthly:' || month_start::date || ':intermediate', 'monthly', 'intermediate', 75, 3),
    (null, 'Monthly 150K', 'distance', month_start, month_start + interval '1 month',
     true, 'monthly:' || month_start::date || ':advanced', 'monthly', 'advanced', 150, 4),
    (null, '90-Day Foundation', 'consistency', month_start, month_start + interval '3 months',
     true, 'quarterly:' || month_start::date || ':beginner', 'quarterly', 'beginner', 45, 8),
    (null, 'Annual 1,000K', 'distance', year_start, year_start + interval '1 year',
     true, 'annual:' || extract(year from year_start)::integer || ':distance', 'annual',
     'advanced', 1000, 24),
    (null, '250 Active Days', 'consistency', year_start, year_start + interval '1 year',
     true, 'annual:' || extract(year from year_start)::integer || ':consistency', 'annual',
     'advanced', 250, 24)
  on conflict (official_key) do nothing;
end;
$$;

revoke all on function public.refresh_official_challenges() from public, anon;
grant execute on function public.refresh_official_challenges() to authenticated;

alter table public.media_read_log
  drop constraint if exists media_read_log_media_kind_check;

alter table public.media_read_log
  add constraint media_read_log_media_kind_check
  check (media_kind in ('avatars', 'covers', 'post-images', 'voice-encouragements'));

alter table public.posts
  drop constraint if exists posts_post_type_check;

alter table public.posts
  add constraint posts_post_type_check
  check (post_type in (
    'post', 'photo', 'video', 'run', 'workout', 'milestone',
    'event', 'memory', 'savings'
  ));

commit;
