-- Allow 'income' on the timeline so money/diet entries appear on your day & streak.
alter table public.timeline_items drop constraint if exists timeline_items_type_check;
alter table public.timeline_items add constraint timeline_items_type_check
  check (type in ('event','task','workout','meal','expense','income','activity'));
