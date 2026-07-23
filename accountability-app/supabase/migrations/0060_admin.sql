-- 0060: admin/oversight layer for a custom dashboard.
-- Security model: the dashboard uses the founder's normal login (anon key + their
-- JWT) — NEVER the service-role key. Every admin action is a SECURITY DEFINER
-- function gated by admin_assert(), which fails unless the caller is in `admins`.
-- A non-admin who calls these gets "not authorized", not data.

-- allowlist of admin users (populated out-of-band by the service role)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security; -- no policies: only definer fns read it

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_assert()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end $$;

-- reports get a resolution status so the dashboard can show an open queue
alter table public.buddy_reports
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid;

-- ── read: dashboard stats ────────────────────────────────────────────────────
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
    'support_total', (select count(*) from public.support_messages),
    'posts_total',   (select count(*) from public.posts)
  );
end $$;

-- ── read: users ──────────────────────────────────────────────────────────────
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select p.id, u.email, p.display_name, p.is_pro,
           (p.is_pro and (p.pro_until is null or p.pro_until > now())) as pro_active,
           p.pro_until, p.area, p.created_at, p.last_active_at
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

-- ── read: reports (open first) ───────────────────────────────────────────────
create or replace function public.admin_list_reports(p_open_only boolean default false, p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select r.id, r.reason, r.created_at, r.resolved_at,
           r.reporter, rp.display_name as reporter_name,
           r.reported, rd.display_name as reported_name
    from public.buddy_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where (not p_open_only) or r.resolved_at is null
    order by (r.resolved_at is null) desc, r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;

-- ── read: support inbox ──────────────────────────────────────────────────────
create or replace function public.admin_list_support(p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select s.id, s.kind, s.subject, s.body, s.created_at,
           s.user_id, p.display_name, u.email
    from public.support_messages s
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
    order by s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;

-- ── actions ──────────────────────────────────────────────────────────────────
-- p_days > 0 → trial that expires in N days; p_days <= 0 → perpetual (no expiry).
create or replace function public.admin_grant_pro(p_user uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  update public.profiles
     set is_pro = true,
         pro_until = case when p_days <= 0 then null else now() + make_interval(days => p_days) end
   where id = p_user;
end $$;

create or replace function public.admin_revoke_pro(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  update public.profiles set is_pro = false, pro_until = null where id = p_user;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_resolve boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  update public.buddy_reports
     set resolved_at = case when p_resolve then now() else null end,
         resolved_by = case when p_resolve then auth.uid() else null end
   where id = p_report;
end $$;

-- Callable by any signed-in user, but the admin_assert() inside each returns
-- "not authorized" unless the caller is in `admins`.
grant execute on function
  public.admin_stats(), public.admin_list_users(text, int, int),
  public.admin_list_reports(boolean, int), public.admin_list_support(int),
  public.admin_grant_pro(uuid, int), public.admin_revoke_pro(uuid),
  public.admin_resolve_report(uuid, boolean), public.is_admin()
  to authenticated;
