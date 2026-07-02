-- Activities -> timeline mirroring in the database (same rationale as 0021):
-- atomic with the activity insert, and a retried save can no longer
-- double-post the timeline card.

create or replace function public.mirror_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.timeline_items (user_id, type, title, note, starts_at, source_id)
    values (
      new.user_id,
      'activity',
      initcap(new.type) || ' · '
        || to_char(round(new.distance_m::numeric / 1000, 2), 'FM999990.00') || ' km',
      case
        when new.duration_s >= 3600
          then to_char(make_interval(secs => new.duration_s), 'HH24:MI:SS')
        else to_char(make_interval(secs => new.duration_s), 'MI:SS')
      end,
      new.started_at,
      new.id
    );
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.timeline_items where source_id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists activities_mirror on public.activities;
create trigger activities_mirror
  after insert or delete on public.activities
  for each row execute function public.mirror_activity();
