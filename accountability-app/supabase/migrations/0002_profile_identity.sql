-- Accountability App — add gender, sexual orientation, and more relationship
-- options to profiles. All optional, private by default.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- Expand allowed relationship statuses.
alter table public.profiles
  drop constraint if exists profiles_relationship_status_check;
alter table public.profiles
  add constraint profiles_relationship_status_check
  check (relationship_status in (
    'single', 'in_relationship', 'married', 'divorced', 'separated', 'prefer_not_to_say'
  ));

-- Gender (optional) + privacy toggle (hidden by default).
alter table public.profiles
  add column if not exists gender text
  check (gender in ('male', 'female'));
alter table public.profiles
  add column if not exists gender_private boolean not null default true;

-- Sexual orientation (optional) + privacy toggle (hidden by default).
alter table public.profiles
  add column if not exists sexual_orientation text
  check (sexual_orientation in ('male', 'female', 'gay', 'lesbian', 'prefer_not_to_say'));
alter table public.profiles
  add column if not exists sexual_orientation_private boolean not null default true;
