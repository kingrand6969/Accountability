begin;

-- Serialize every authenticated caller's admission decision per configured
-- table. Without this lock, concurrent inserts can all observe the same prior
-- count and collectively exceed the configured window before any row commits.
-- Buddy reports keep their existing report_content lock so direct inserts and
-- the report_content RPC continue to share one idempotency/rate boundary.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cfg public.rate_limits%rowtype;
  n bigint;
  uid uuid := auth.uid();
begin
  if tg_table_name = 'buddy_reports' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('report_content:' || new.reporter::text, 0)
    );
  end if;

  if uid is null then
    return new;
  end if;

  select *
    into cfg
    from public.rate_limits
   where tbl = tg_table_name;
  if not found then
    return new;
  end if;

  if tg_table_name <> 'buddy_reports' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'rate-limit:' || tg_table_schema || '.' || tg_table_name || ':' || uid::text,
        0
      )
    );
  end if;

  execute pg_catalog.format(
    'select pg_catalog.count(*) from public.%I where %I = $1 and created_at > pg_catalog.now() - pg_catalog.make_interval(secs => $2)',
    tg_table_name,
    cfg.owner_col
  )
    into n
    using uid, cfg.window_secs;

  if n >= cfg.max_rows then
    raise exception 'Too many actions in a short time — please slow down and try again shortly.'
      using errcode = '54000';
  end if;

  return new;
end
$function$;

commit;
