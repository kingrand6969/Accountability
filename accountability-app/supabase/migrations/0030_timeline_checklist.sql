-- Timeline items can carry a checklist: [{ "text": "...", "done": false }, ...].
-- The card shows only the title; tapping opens note + checklist detail.
alter table public.timeline_items
  add column if not exists checklist jsonb;
