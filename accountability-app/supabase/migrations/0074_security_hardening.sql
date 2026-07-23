-- 0074: security hardening from the whole-app audit.
--  (1) sanitize display_name at the DB layer — removes the SOURCE of the admin
--      dashboard + map stored-XSS (angle brackets / control chars can never be
--      stored, whatever a client sends directly to the API).
--  (2) lock buddy_messages UPDATE to read_at only — a recipient can no longer
--      forge/rewrite the sender's message body.
--  (3) enforce BANS and RESTRICTIONS server-side on INSERT *and UPDATE* of
--      content — a banned/restricted user with a still-valid JWT can no longer
--      create OR edit content by calling the API directly.

-- ── (1) display_name sanitizer ───────────────────────────────────────────────
-- strips angle brackets + control chars, collapses whitespace, caps length.
-- keeps spaces, hyphens, apostrophes, and all unicode letters (real names).
create or replace function public.sanitize_display_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.display_name is not null then
    new.display_name := regexp_replace(new.display_name, '[<>[:cntrl:]]', '', 'g');
    new.display_name := btrim(regexp_replace(new.display_name, '\s+', ' ', 'g'));
    if length(new.display_name) > 60 then
      new.display_name := left(new.display_name, 60);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sanitize_display_name on public.profiles;
create trigger sanitize_display_name before insert or update of display_name
  on public.profiles for each row execute function public.sanitize_display_name();

-- clean any already-stored names containing the dangerous characters
update public.profiles
   set display_name = btrim(regexp_replace(regexp_replace(display_name, '[<>[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'))
 where display_name ~ '[<>[:cntrl:]]';

-- ── (2) buddy_messages: only read_at is writable by members ───────────────────
revoke update on public.buddy_messages from authenticated;
grant  update (read_at) on public.buddy_messages to authenticated;

-- ── (3) server-side ban + restriction enforcement (INSERT and UPDATE) ─────────
create or replace function public.enforce_sanctions()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r_until timestamptz; r_msg text; b_until timestamptz;
begin
  if uid is null then return new; end if;             -- service_role / server tasks
  select banned_until into b_until from auth.users where id = uid;
  if b_until is not null and b_until > now() then
    raise exception 'Your account is banned.' using errcode = '42501';
  end if;
  select restricted_until, restrict_message into r_until, r_msg
    from public.profiles where id = uid;
  if r_until is not null and r_until > now() then
    raise exception 'Your account is restricted until % — %',
      to_char(r_until, 'Mon DD, YYYY'), coalesce(nullif(r_msg, ''), 'a rules violation')
      using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- content that can be created OR edited → guard both
  foreach t in array array['posts', 'post_comments', 'stories'] loop
    execute format('drop trigger if exists enforce_restriction on public.%I', t);
    execute format('drop trigger if exists enforce_sanctions on public.%I', t);
    execute format(
      'create trigger enforce_sanctions before insert or update on public.%I for each row execute function public.enforce_sanctions()', t);
  end loop;
  -- messages are insert-only content
  foreach t in array array['buddy_messages'] loop
    execute format('drop trigger if exists enforce_restriction on public.%I', t);
    execute format('drop trigger if exists enforce_sanctions on public.%I', t);
    execute format(
      'create trigger enforce_sanctions before insert on public.%I for each row execute function public.enforce_sanctions()', t);
  end loop;
end $$;
