-- 0061: content moderation — NOTIFY, never auto-remove.
-- Every new post/comment/story/message fires an async background check (pg_net →
-- the moderate-content Edge Function → OpenAI's FREE moderation). Anything flagged
-- lands in moderation_flags for the admin to review in the dashboard. Nothing is
-- hidden or deleted automatically, and the check is FAIL-OPEN: if moderation is
-- unconfigured or unreachable, the write still succeeds — users are never blocked.

create extension if not exists pg_net with schema extensions;

-- server-only config (function url + shared secret). No client access.
create table if not exists public.internal_config (key text primary key, value text);
alter table public.internal_config enable row level security;

-- the review queue (written by the Edge Function via the service role)
create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  author_id uuid,
  excerpt text,
  image_url text,
  categories text[] not null default '{}',
  max_score numeric,
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
alter table public.moderation_flags enable row level security; -- admin RPCs only
create index if not exists moderation_flags_open_idx on public.moderation_flags (status, created_at desc);

-- enqueue a background moderation check after a write. Fail-open on any error.
create or replace function public.enqueue_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg_url text;
  cfg_secret text;
begin
  select value into cfg_url from public.internal_config where key = 'moderation_url';
  if cfg_url is null or cfg_url = '' then
    return new; -- not configured yet → skip silently
  end if;
  select value into cfg_secret from public.internal_config where key = 'moderation_secret';
  perform net.http_post(
    url := cfg_url,
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-moderation-secret', coalesce(cfg_secret, ''))
  );
  return new;
exception when others then
  return new; -- moderation must NEVER block or fail a user's write
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'stories', 'buddy_messages'] loop
    execute format('drop trigger if exists moderate_after_insert on public.%I', t);
    execute format(
      'create trigger moderate_after_insert after insert on public.%I for each row execute function public.enqueue_moderation()',
      t
    );
  end loop;
end $$;

-- ── admin: review queue ──────────────────────────────────────────────────────
create or replace function public.admin_list_flags(p_open_only boolean default true, p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select f.id, f.source_table, f.source_id, f.excerpt, f.image_url, f.categories, f.max_score,
           f.status, f.created_at, f.author_id, p.display_name as author_name
    from public.moderation_flags f
    left join public.profiles p on p.id = f.author_id
    where (not p_open_only) or f.status = 'open'
    order by (f.status = 'open') desc, f.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;

create or replace function public.admin_resolve_flag(p_flag uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  if p_status not in ('open', 'dismissed', 'actioned') then
    raise exception 'bad status';
  end if;
  update public.moderation_flags
     set status = p_status,
         reviewed_at = case when p_status = 'open' then null else now() end,
         reviewed_by = case when p_status = 'open' then null else auth.uid() end
   where id = p_flag;
end $$;

-- add the open-flag count to the dashboard stats
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_assert();
  return json_build_object(
    'total_users',   (select count(*) from public.profiles),
    'new_7d',        (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d',       (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_7d',     (select count(*) from public.profiles where last_active_at > now() - interval '7 days'),
    'pro_active',    (select count(*) from public.profiles where is_pro and (pro_until is null or pro_until > now())),
    'reports_open',  (select count(*) from public.buddy_reports where resolved_at is null),
    'flags_open',    (select count(*) from public.moderation_flags where status = 'open'),
    'support_total', (select count(*) from public.support_messages),
    'posts_total',   (select count(*) from public.posts)
  );
end $$;

grant execute on function
  public.admin_list_flags(boolean, int), public.admin_resolve_flag(uuid, text)
  to authenticated;
