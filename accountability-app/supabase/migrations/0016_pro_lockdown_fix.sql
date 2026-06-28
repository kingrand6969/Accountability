-- Accountability App — properly restrict which profile columns the client may
-- update. A column-level REVOKE is ignored while a table-level UPDATE grant
-- exists, so we revoke table-level UPDATE and re-grant ONLY the safe columns.
-- is_pro / pro_until (and id / created_at) are intentionally excluded — they are
-- server-controlled (RevenueCat webhook via service role).
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update (
  display_name,
  avatar_url,
  bio,
  birthday,
  birthday_private,
  relationship_status,
  gender,
  gender_private,
  sexual_orientation,
  sexual_orientation_private,
  area,
  show_last_active,
  last_active_at,
  buddy_opt_in,
  calorie_target
) on public.profiles to authenticated;

-- Undo the (ineffective) column revoke from 0015 so the columns are simply
-- absent from the grant above rather than explicitly revoked at column level.
-- (No-op if already not granted.)
