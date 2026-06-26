-- Accountability App — link a scheduled local-notification id to a timeline
-- item so we can cancel the alarm if the item is deleted.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.timeline_items
  add column if not exists reminder_id text;
