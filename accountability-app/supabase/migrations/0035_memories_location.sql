-- Memories become an automatic album of posted moments (not a manual uploader):
-- captured at post time with optional place label shown in the gallery.

alter table public.memories
  add column if not exists location text check (location is null or length(location) <= 120);
