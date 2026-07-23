-- 0062: user sanctions — warnings, restrictions (N days, can't post), and bans.
-- Every action is recorded in user_sanctions (audit trail) and carries a
-- human message shown to the member. Writes are performed by the admin-actions
-- Edge Function (service role, gated by is_admin) — bans also disable auth-level
-- login. Restrictions are enforced server-side by a trigger on content tables.

alter table public.profiles
  add column if not exists banned_at        timestamptz,
  add column if not exists ban_message      text,
  add column if not exists restricted_until timestamptz,
  add column if not exists restrict_message text,
  add column if not exists warning_message  text,
  add column if not exists warned_at         timestamptz,
  add column if not exists warning_ack_at    timestamptz;

create table if not exists public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  admin_id uuid,
  action text not null check (action in ('warning', 'restrict', 'ban', 'unban', 'clear')),
  reason text,          -- short category, e.g. "Harassment"
  message text,         -- the note shown to the member
  days int,             -- restriction / temp-ban length
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.user_sanctions enable row level security; -- admin/service only
create index if not exists user_sanctions_user_idx on public.user_sanctions (user_id, created_at desc);

-- Server-side restriction: a restricted member can't create public content.
create or replace function public.enforce_restriction()
returns trigger language plpgsql security definer set search_path = public as $$
declare r_until timestamptz; r_msg text; uid uuid := auth.uid();
begin
  if uid is null then return new; end if;
  select restricted_until, restrict_message into r_until, r_msg
    from public.profiles where id = uid;
  if r_until is not null and r_until > now() then
    raise exception 'Your account is restricted until % — %',
      to_char(r_until, 'Mon DD, YYYY'), coalesce(nullif(r_msg, ''), 'a rules violation')
      using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'buddy_messages', 'stories'] loop
    execute format('drop trigger if exists enforce_restriction on public.%I', t);
    execute format(
      'create trigger enforce_restriction before insert on public.%I for each row execute function public.enforce_restriction()',
      t
    );
  end loop;
end $$;

-- App reads its own sanction state (drives the ban screen / warning modal / banner).
create or replace function public.my_moderation_state()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'banned', banned_at is not null,
    'ban_message', ban_message,
    'restricted_until', case when restricted_until > now() then restricted_until else null end,
    'restrict_message', case when restricted_until > now() then restrict_message else null end,
    'warning', case when warned_at is not null and warning_ack_at is null then warning_message else null end
  )
  from public.profiles where id = auth.uid();
$$;

-- Member acknowledges a warning (clears the modal).
create or replace function public.acknowledge_warning()
returns void language sql security definer set search_path = public as $$
  update public.profiles set warning_ack_at = now() where id = auth.uid();
$$;

grant execute on function public.my_moderation_state(), public.acknowledge_warning() to authenticated;

-- Surface sanction status in the admin user list.
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
           (p.warned_at is not null and p.warning_ack_at is null) as warned
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

-- Admin reads a member's sanction history for the dashboard.
create or replace function public.admin_list_sanctions(p_user uuid, p_limit int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select action, reason, message, days, expires_at, created_at
    from public.user_sanctions where user_id = p_user
    order by created_at desc limit greatest(1, least(coalesce(p_limit,30), 100))
  ) t;
  return result;
end $$;

grant execute on function public.admin_list_sanctions(uuid, int) to authenticated;
