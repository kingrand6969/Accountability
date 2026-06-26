-- Accountability App — Pro subscription flag on profiles.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- NOTE (before launch): in production, is_pro must be set ONLY by the
-- RevenueCat webhook using the service-role key (which bypasses RLS), and the
-- client must NOT be able to self-grant Pro. For now the existing
-- "Users update own profile" policy lets the client toggle is_pro so we can
-- test gating in development. Lock this down (column trigger / restricted
-- policy) when wiring real billing.

alter table public.profiles
  add column if not exists is_pro boolean not null default false;
alter table public.profiles
  add column if not exists pro_until timestamptz;
