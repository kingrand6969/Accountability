-- 0065: richer system stats — per-table disk size (not just row counts) and a
-- public-schema total, so the dashboard's System tab shows exactly where the
-- database's bytes go.

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
    buckets := '[]'::json;
  end;

  select coalesce(json_agg(row_to_json(t)), '[]'::json) into tables from (
    select * from (values
      ('profiles',          (select count(*) from public.profiles),          pg_total_relation_size('public.profiles')),
      ('posts',             (select count(*) from public.posts),             pg_total_relation_size('public.posts')),
      ('post_comments',     (select count(*) from public.post_comments),     pg_total_relation_size('public.post_comments')),
      ('stories',           (select count(*) from public.stories),           pg_total_relation_size('public.stories')),
      ('buddy_messages',    (select count(*) from public.buddy_messages),    pg_total_relation_size('public.buddy_messages')),
      ('moderation_flags',  (select count(*) from public.moderation_flags),  pg_total_relation_size('public.moderation_flags')),
      ('user_sanctions',    (select count(*) from public.user_sanctions),    pg_total_relation_size('public.user_sanctions')),
      ('buddy_reports',     (select count(*) from public.buddy_reports),     pg_total_relation_size('public.buddy_reports')),
      ('support_messages',  (select count(*) from public.support_messages),  pg_total_relation_size('public.support_messages')),
      ('user_ips',          (select count(*) from public.user_ips),          pg_total_relation_size('public.user_ips'))
    ) as v(name, rows, bytes) order by bytes desc
  ) t;

  return json_build_object(
    'db_bytes',        pg_database_size(current_database()),
    'db_public_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind in ('r', 'm')),
    'buckets',         buckets,
    'tables',          tables,
    'auth_users',      (select count(*) from auth.users),
    'flags_by_status', (select coalesce(json_object_agg(status, n), '{}'::json)
                        from (select status, count(*)::int as n from public.moderation_flags group by status) s),
    'ip_bans',         (select count(*) from public.ip_bans),
    'generated_at',    now()
  );
end $$;

grant execute on function public.admin_system_stats() to authenticated;
