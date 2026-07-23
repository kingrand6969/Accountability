-- 0073: surface the reported user's current strike count in the reports list,
-- so the admin dashboard can compose an accurate "strike N of 5" warning when a
-- user-reported post is removed (Reports tab now has the same power as Flagged).
create or replace function public.admin_list_reports(p_open_only boolean default false, p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select r.id, r.reason, r.created_at, r.resolved_at,
           r.reporter, rp.display_name as reporter_name,
           r.reported, rd.display_name as reported_name,
           coalesce(rd.strike_count, 0) as reported_strikes
    from public.buddy_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where (not p_open_only) or r.resolved_at is null
    order by (r.resolved_at is null) desc, r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;
