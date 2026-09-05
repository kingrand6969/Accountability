begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Freeze post bodies while proving fallback provenance, then drain and block
-- public-share writers until the exact active-row repair commits.
lock table public.posts in share mode;
lock table public.public_shares in share row exclusive mode;

-- Canonical creator functions emitted these descriptions. Requiring an exact
-- legacy fallback title, blank linked body and matching owner makes the repair
-- narrow; custom titles, custom descriptions and nonblank posts stay intact.
update public.public_shares as s
set title = 'A win from Mantle'
from public.posts as p
where p.id = s.post_id
  and p.user_id = s.owner_id
  and s.revoked_at is null
  and s.expires_at > now()
  and s.title = 'A win from AccountAbility'
  and nullif(trim(p.body), '') is null
  and s.description in (
    'Shared from AccountAbility',
    'Shared from Mantle',
    'A progress update shared with permission from AccountAbility.',
    'A progress update shared with permission from Mantle.'
  );

commit;
