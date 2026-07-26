-- Stable client operation IDs make post retries safe after lost responses.
-- Existing rows remain valid with NULL; new idempotent clients supply a UUID.

alter table public.posts
  add column if not exists client_operation_id uuid;

create unique index if not exists posts_user_client_operation_unique
  on public.posts (user_id, client_operation_id)
  where client_operation_id is not null;

-- Existing posts RLS already permits authors to select and insert their own
-- rows. The operation ID does not widen visibility or mutation privileges.
