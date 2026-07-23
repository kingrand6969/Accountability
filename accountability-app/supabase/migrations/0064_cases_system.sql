-- 0064: moderation case archive + system/storage monitoring for the dashboard.
-- Flags were already never deleted; this adds the RPCs to browse the full
-- archive (appeals need the paper trail), pull one member's complete file
-- (profile + sanctions + strikes), and watch database/storage usage so the
-- founder is warned before hitting plan limits.

-- ── the full moderation log (every flag, any status, searchable) ─────────────
create or replace function public.admin_moderation_log(
  p_search text default null, p_status text default null, p_limit int default 100, p_offset int default 0)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select f.id, f.source_table, f.source_id, f.excerpt, f.image_url, f.categories, f.max_score,
           f.status, f.created_at, f.reviewed_at, f.author_id,
           p.display_name as author_name, u.email as author_email,
           coalesce(p.strike_count, 0) as author_strikes,
           ra.display_name as reviewed_by_name
    from public.moderation_flags f
    left join public.profiles p on p.id = f.author_id
    left join auth.users u on u.id = f.author_id
    left join public.profiles ra on ra.id = f.reviewed_by
    where (p_status is null or f.status = p_status)
      and (p_search is null
           or p.display_name ilike '%' || p_search || '%'
           or u.email ilike '%' || p_search || '%'
           or f.excerpt ilike '%' || p_search || '%')
    order by f.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;
  return result;
end $$;

-- ── one member's complete file (drives the appeal review modal) ──────────────
create or replace function public.admin_get_user(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select row_to_json(t) into result from (
    select p.id, u.email, p.display_name, p.area, p.created_at, p.last_active_at,
           p.is_pro, (p.is_pro and (p.pro_until is null or p.pro_until > now())) as pro_active,
           p.banned_at is not null as banned, p.ban_message,
           case when p.restricted_until > now() then p.restricted_until else null end as restricted_until,
           (p.warned_at is not null and p.warning_ack_at is null) as warned,
           p.strike_count as strikes,
           (select count(*)::int from public.moderation_flags f where f.author_id = p.id) as flags_total,
           (select count(*)::int from public.moderation_flags f where f.author_id = p.id and f.status = 'removed') as flags_removed
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = p_user
  ) t;
  return result;
end $$;

-- ── system / storage health ──────────────────────────────────────────────────
create or replace function public.admin_system_stats()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  buckets json;
  tables json;
begin
  perform admin_assert();

  begin
    select coalesce(json_agg(row_to_json(b)), '[]'::json) into buckets from (
      select bucket_id as name, count(*)::int as files,
             coalesce(sum(nullif(metadata->>'size','')::bigint), 0)::bigint as bytes
      from storage.objects group by bucket_id order by bytes desc
    ) b;
  exception when others then
    buckets := '[]'::json; -- storage schema unreadable → degrade gracefully
  end;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into tables from (
    select * from (values
      ('profiles',          (select count(*) from public.profiles)),
      ('posts',             (select count(*) from public.posts)),
      ('post_comments',     (select count(*) from public.post_comments)),
      ('stories',           (select count(*) from public.stories)),
      ('buddy_messages',    (select count(*) from public.buddy_messages)),
      ('moderation_flags',  (select count(*) from public.moderation_flags)),
      ('user_sanctions',    (select count(*) from public.user_sanctions)),
      ('buddy_reports',     (select count(*) from public.buddy_reports)),
      ('support_messages',  (select count(*) from public.support_messages)),
      ('user_ips',          (select count(*) from public.user_ips))
    ) as v(name, rows) order by rows desc
  ) t;

  return json_build_object(
    'db_bytes',       pg_database_size(current_database()),
    'buckets',        buckets,
    'tables',         tables,
    'auth_users',     (select count(*) from auth.users),
    'flags_by_status', (select coalesce(json_object_agg(status, n), '{}'::json)
                        from (select status, count(*)::int as n from public.moderation_flags group by status) s),
    'ip_bans',        (select count(*) from public.ip_bans),
    'generated_at',   now()
  );
end $$;

grant execute on function
  public.admin_moderation_log(text, text, int, int),
  public.admin_get_user(uuid),
  public.admin_system_stats()
  to authenticated;
