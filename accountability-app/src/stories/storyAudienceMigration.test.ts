import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const migrationPath = path.join(
  __dirname,
  '..',
  '..',
  'supabase',
  'migrations',
  '0098_story_followers_and_views.sql',
);

const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase()
  : '';

describe('0098 followed My Day stories and view receipts migration', () => {
  test('creates private, per-viewer story receipts with the required keys and index', () => {
    expect(migration).toMatch(/create table if not exists public\.story_views/);
    expect(migration).toMatch(/story_id uuid not null references public\.stories \(id\) on delete cascade/);
    expect(migration).toMatch(/user_id uuid not null references public\.profiles \(id\) on delete cascade/);
    expect(migration).toMatch(/viewed_at timestamptz not null default now\(\)/);
    expect(migration).toMatch(/primary key \(story_id, user_id\)/);
    expect(migration).toMatch(/create index if not exists story_views_user_story_idx on public\.story_views \(user_id, story_id\)/);
  });

  test('enables RLS and only permits receipts for stories visible to the viewer', () => {
    expect(migration).toContain('alter table public.story_views enable row level security');
    expect(migration).toMatch(/create policy story_views_select on public\.story_views for select to authenticated using \(user_id = auth\.uid\(\)\)/);
    expect(migration).toMatch(/create policy story_views_insert on public\.story_views for insert to authenticated with check \( story_views\.user_id = auth\.uid\(\) and exists \( select 1 from public\.stories visible_story where visible_story\.id = story_views\.story_id \) \)/);
    expect(migration).toContain('revoke all on table public.story_views from public, anon, authenticated');
    expect(migration).toContain('grant select on table public.story_views to authenticated');
    expect(migration).toContain('grant insert (story_id, user_id) on table public.story_views to authenticated');
    expect(migration).not.toMatch(/grant insert \([^)]*viewed_at/);
    expect(migration).not.toMatch(/grant [^;]*story_views[^;]* to (?:public|anon)\b/);
  });

  test('keeps receipts immutable after their composite identity is inserted', () => {
    expect(migration).toMatch(/primary key \(story_id, user_id\)/);
    expect(migration).not.toMatch(/create policy story_views_update/);
    expect(migration).not.toMatch(/grant (?:[^;]*, )?update(?:,| on)/);
    expect(migration).not.toMatch(/create policy story_views_delete/);
    expect(migration).not.toMatch(/grant (?:[^;]*, )?delete(?:,| on)/);
  });

  test('shows active, unblocked stories to buddies or followers without precedence leaks', () => {
    expect(migration).toMatch(/create policy stories_select on public\.stories for select to authenticated using \( moderation_state = 'visible' and \( \(user_id = auth\.uid\(\)\) or \( expires_at > now\(\) and not public\.users_blocked\(auth\.uid\(\), user_id\) and \( public\.are_buddies\(user_id, auth\.uid\(\)\) or exists \( select 1 from public\.buddy_stars/);
    expect(migration).toMatch(/where bs\.target = stories\.user_id and bs\.starrer = auth\.uid\(\)/);
    expect(migration).toMatch(/buddy stars.*followed-person relationship/);
  });

  test('only replaces the select policy on stories and preserves owner mutation policies', () => {
    expect(migration).toContain('drop policy if exists stories_select on public.stories');
    expect(migration).not.toMatch(/(?:drop|create) policy stories_(?:insert|delete)/);
    expect(migration).not.toMatch(/grant .* on table public\.stories/);
  });
});
