-- 0063: strikes + content removal + IP abuse tracking.
-- The admin can now REMOVE flagged content (always a human decision — nothing is
-- ever removed automatically): the member gets a warning quoting what was removed
-- and a strike. 5 strikes = ban review. Every sign-in records the member's IP
-- (server-side, via the session-ping Edge Function) so repeat abusers can be
-- blocked at the network level, not just the account level. Disclosed in the
-- Terms of Service + Privacy Policy (LEGAL_VERSION 2026-07-18).

-- ── strikes ──────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists strike_count int not null default 0;

-- 'remove' joins the sanction audit trail (admin removed a piece of content)
alter table public.user_sanctions drop constraint if exists user_sanctions_action_check;
alter table public.user_sanctions
  add constraint user_sanctions_action_check
  check (action in ('warning', 'restrict', 'ban', 'unban', 'clear', 'remove'));

-- flags gain a 'removed' outcome (the admin deleted the content)
alter table public.moderation_flags drop constraint if exists moderation_flags_status_check;
alter table public.moderation_flags
  add constraint moderation_flags_status_check
  check (status in ('open', 'dismissed', 'actioned', 'removed'));

-- ── IP tracking (written ONLY by the session-ping Edge Function, service role;
--    the client never self-reports its IP — it can't be trusted to) ───────────
create table if not exists public.user_ips (
  user_id uuid not null references auth.users (id) on delete cascade,
  ip text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  hits int not null default 1,
  primary key (user_id, ip)
);
alter table public.user_ips enable row level security; -- no policies: server only
create index if not exists user_ips_ip_idx on public.user_ips (ip);

create table if not exists public.ip_bans (
  ip text primary key,
  reason text,
  admin_id uuid,
  created_at timestamptz not null default now()
);
alter table public.ip_bans enable row level security; -- no policies: server only

-- ── admin RPCs ───────────────────────────────────────────────────────────────

-- member list now carries strikes (shown in the dashboard)
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select p.id, u.email, p.display_name, p.is_pro,
           (p.is_pro and (p.pro_until is null or p.pro_until > now())) as pro_active,
           p.pro_until, p.area, p.created_at, p.last_active_at,
           p.banned_at is not null as banned,
           case when p.restricted_until > now() then p.restricted_until else null end as restricted_until,
           (p.warned_at is not null and p.warning_ack_at is null) as warned,
           p.strike_count as strikes
    from public.profiles p
    join auth.users u on u.id = p.id
    where p_search is null
       or p.display_name ilike '%' || p_search || '%'
       or u.email ilike '%' || p_search || '%'
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;
  return result;
end $$;

-- flag queue now carries the author's user_id + strike count (drives the
-- "strike N of 5" message and the 5-strike ban prompt in the dashboard)
create or replace function public.admin_list_flags(p_open_only boolean default true, p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select f.id, f.source_table, f.source_id, f.excerpt, f.image_url, f.categories, f.max_score,
           f.status, f.created_at, f.author_id, p.display_name as author_name,
           coalesce(p.strike_count, 0) as author_strikes
    from public.moderation_flags f
    left join public.profiles p on p.id = f.author_id
    where (not p_open_only) or f.status = 'open'
    order by (f.status = 'open') desc, f.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;

-- a member's known IPs (for the ban dialog)
create or replace function public.admin_list_ips(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select i.ip, i.first_seen, i.last_seen, i.hits, (b.ip is not null) as banned
    from public.user_ips i
    left join public.ip_bans b on b.ip = i.ip
    where i.user_id = p_user
    order by i.last_seen desc limit 20
  ) t;
  return result;
end $$;

create or replace function public.admin_ban_ip(p_ip text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  insert into public.ip_bans (ip, reason, admin_id) values (p_ip, p_reason, auth.uid())
  on conflict (ip) do nothing;
end $$;

create or replace function public.admin_unban_ip(p_ip text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  delete from public.ip_bans where ip = p_ip;
end $$;

grant execute on function
  public.admin_list_ips(uuid), public.admin_ban_ip(text, text), public.admin_unban_ip(text)
  to authenticated;
