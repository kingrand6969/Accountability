-- Accountability App — Pro entitlement is server-controlled.
-- is_pro / pro_until may ONLY be written by the service role (the RevenueCat
-- webhook). The client (authenticated role) can no longer self-grant Pro.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

revoke update (is_pro, pro_until) on public.profiles from authenticated;
revoke update (is_pro, pro_until) on public.profiles from anon;
