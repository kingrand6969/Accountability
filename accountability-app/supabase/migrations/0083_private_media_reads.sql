-- Rate-limit authenticated private R2 read-link requests.
create table if not exists public.media_read_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_kind text not null check (media_kind in ('avatars', 'covers', 'post-images')),
  created_at timestamptz not null default now()
);
alter table public.media_read_log enable row level security;
create index if not exists media_read_log_user_created_idx on public.media_read_log (user_id, created_at desc);
drop policy if exists media_read_log_insert on public.media_read_log;
create policy media_read_log_insert on public.media_read_log for insert to authenticated with check (user_id = auth.uid());
insert into public.rate_limits (tbl, owner_col, max_rows, window_secs)
values ('media_read_log', 'user_id', 600, 3600)
on conflict (tbl) do update set owner_col = excluded.owner_col, max_rows = excluded.max_rows, window_secs = excluded.window_secs;
drop trigger if exists rl_enforce on public.media_read_log;
create trigger rl_enforce before insert on public.media_read_log for each row execute function public.enforce_rate_limit();
create or replace function public.prune_media_read_log()
returns void language sql security definer set search_path = public as $$
  delete from public.media_read_log where created_at < now() - interval '2 days';
$$;

-- Never publish a private object reference as public share metadata.
create or replace function public.create_public_post_share(p_post uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; share_id uuid;
begin
  select id, user_id, body, image_url into p from public.posts where id = p_post and user_id = auth.uid();
  if not found then raise exception 'That post cannot be shared by this account.' using errcode = '42501'; end if;
  insert into public.public_shares (owner_id, post_id, title, description, preview_image_url)
  values (auth.uid(), p.id, left(coalesce(nullif(trim(p.body), ''), 'A win from AccountAbility'), 160),
    'Shared from AccountAbility', case when p.image_url like 'r2://%' then null else p.image_url end)
  returning id into share_id;
  return share_id;
end;
$$;
