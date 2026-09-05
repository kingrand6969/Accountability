begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SHARE ROW EXCLUSIVE conflicts with the ROW EXCLUSIVE lock taken by INSERT.
-- After 0117 commits, this waits for any old-function writer to finish, then
-- prevents another writer from entering until both exact repairs commit.
lock table public.public_shares in share row exclusive mode;

-- These descriptions were emitted by historical creator functions. Exact
-- equality keeps custom descriptions untouched; old values no longer match
-- after one run, making both repairs idempotent. Stored titles are untouched
-- because their fallback provenance cannot be recovered safely.
update public.public_shares
set description = 'Shared from Mantle'
where revoked_at is null
  and expires_at > now()
  and description = 'Shared from AccountAbility';

update public.public_shares
set description = 'A progress update shared with permission from Mantle.'
where revoked_at is null
  and expires_at > now()
  and description = 'A progress update shared with permission from AccountAbility.';

commit;
