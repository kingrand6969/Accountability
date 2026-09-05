import { describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/0109_atomic_event_announcements.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const sql = migration.replace(/\s+/g, ' ').toLowerCase();

type EventAudience = 'buddies' | 'public';
type VisibilityState = {
  viewer: 'owner' | 'buddy' | 'stranger';
  audience: EventAudience;
  blocked?: boolean;
};

function modelCanViewEventPost({ viewer, audience, blocked = false }: VisibilityState): boolean {
  if (viewer === 'owner') return true;
  if (blocked) return false;
  return audience === 'public' || (audience === 'buddies' && viewer === 'buddy');
}

function modelCanReadGroup(input: {
  privacy: 'public' | 'private';
  owner?: boolean;
  member?: boolean;
}): boolean {
  return input.privacy === 'public' || input.owner === true || input.member === true;
}

function modelCanAttend(input: VisibilityState & { expectedOwnerMatches: boolean }): boolean {
  return input.expectedOwnerMatches && modelCanViewEventPost(input);
}

describe('atomic event announcement migration', () => {
  test('installs one authenticated-only transaction with a closed execution boundary', () => {
    expect(migration).not.toBe('');
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toMatch(/create or replace function public\.create_event_announcement\(/);
    expect(sql).toContain('security definer set search_path = \'\'');
    expect(sql).toMatch(/revoke (?:all|execute) on function public\.create_event_announcement\([\s\S]*?from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.create_event_announcement\([\s\S]*?to authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.create_event_announcement\([\s\S]*?to anon/);
  });

  test('binds the expected owner and serializes retries before any insert', () => {
    expect(sql).toMatch(/p_expected_owner is null[\s\S]*?auth\.uid\(\) is null[\s\S]*?auth\.uid\(\) <> p_expected_owner/);
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock');
    const lockAt = sql.indexOf('pg_catalog.pg_advisory_xact_lock');
    const firstInsertAt = sql.indexOf('insert into public.');
    expect(lockAt).toBeGreaterThan(-1);
    expect(firstInsertAt).toBeGreaterThan(lockAt);
    expect(sql).toMatch(/where p\.user_id = p_expected_owner[\s\S]*?p\.client_operation_id = p_operation_id/);
  });

  test('replays the committed triple but rejects a key owned by a non-event post', () => {
    expect(sql).toMatch(/if found then[\s\S]*?v_existing_event_id is null[\s\S]*?raise exception/);
    expect(sql).toMatch(/return query[\s\S]*?v_existing_group_id[\s\S]*?v_existing_event_id[\s\S]*?v_existing_post_id/);
    expect(sql).toMatch(/client_operation_id[\s\S]*?values \([\s\S]*?p_operation_id/);
  });

  test('validates inputs then creates the group, event and event post atomically', () => {
    expect(sql).toMatch(/char_length\(v_title\)[\s\S]*?between 3 and 120/);
    expect(sql).toMatch(/p_audience not in \('buddies', 'public'\)/);
    expect(sql).toContain('insert into public.groups');
    expect(sql).toContain('insert into public.events');
    expect(sql).toContain('insert into public.posts');
    expect(sql).toMatch(/'event'[\s\S]*?p_operation_id/);
    expect(sql).toMatch(/v_show_on_card := p_audience = 'public' and coalesce\(p_show_on_card, false\)/);
    expect(sql).not.toMatch(/exception\s+when/);
  });

  test('creates Buddies event groups as private and Public event groups as discoverable', () => {
    expect(sql).toMatch(
      /insert into public\.groups \(name, description, created_by, privacy\)[\s\S]*?case when p_audience = 'public' then 'public' else 'private' end/,
    );
    expect(modelCanReadGroup({ privacy: 'public' })).toBe(true);
    expect(modelCanReadGroup({ privacy: 'private', owner: true })).toBe(true);
    expect(modelCanReadGroup({ privacy: 'private', member: true })).toBe(true);
    expect(modelCanReadGroup({ privacy: 'private' })).toBe(false);
    expect(sql).toMatch(
      /update public\.groups g set privacy = case when exists \([\s\S]*?p\.audience = 'public'[\s\S]*?then 'public' else 'private' end where exists \([\s\S]*?e\.group_id = g\.id/,
    );
  });

  test('replaces broad group and event reads with privacy-aware policies', () => {
    expect(sql).toMatch(/drop policy if exists groups_select on public\.groups/);
    expect(sql).toMatch(
      /create policy groups_select on public\.groups for select to authenticated using \( privacy = 'public' or created_by = auth\.uid\(\) or exists \( select 1 from public\.group_members gm where gm\.group_id = groups\.id and gm\.user_id = auth\.uid\(\) \) \)/,
    );
    expect(sql).toMatch(/drop policy if exists events_select on public\.events/);
    expect(sql).toMatch(
      /create policy events_select on public\.events for select to authenticated using \( created_by = auth\.uid\(\) or exists \( select 1 from public\.posts p where p\.event_id = events\.id and public\.can_view_post\(p\.id, auth\.uid\(\)\) \) \)/,
    );
    expect(sql).not.toMatch(/create policy (?:groups|events)_select[\s\S]{0,120}using \(true\)/);
  });

  test.each([
    [{ viewer: 'owner', audience: 'buddies' } as const, true],
    [{ viewer: 'buddy', audience: 'buddies' } as const, true],
    [{ viewer: 'stranger', audience: 'buddies' } as const, false],
    [{ viewer: 'stranger', audience: 'public' } as const, true],
    [{ viewer: 'buddy', audience: 'buddies', blocked: true } as const, false],
    [{ viewer: 'stranger', audience: 'public', blocked: true } as const, false],
  ])('models centralized event visibility for %o', (state, expected) => {
    expect(modelCanViewEventPost(state)).toBe(expected);
  });

  test('attends only through the linked post visibility boundary and is replay-safe', () => {
    expect(sql).toMatch(
      /create or replace function public\.attend_event\(\s*p_event_id uuid,\s*p_expected_owner uuid\s*\)/,
    );
    expect(sql).toMatch(/language plpgsql security definer set search_path = ''/);
    expect(sql).toMatch(
      /where e\.id = p_event_id[\s\S]*?e\.created_by = p_expected_owner[\s\S]*?p\.event_id = e\.id[\s\S]*?p\.user_id = p_expected_owner[\s\S]*?public\.can_view_post\(p\.id, v_viewer\)/,
    );
    expect(sql).toMatch(
      /insert into public\.group_members \(group_id, user_id\)[\s\S]*?on conflict \(group_id, user_id\) do nothing/,
    );

    expect(modelCanAttend({
      viewer: 'buddy', audience: 'buddies', expectedOwnerMatches: true,
    })).toBe(true);
    expect(modelCanAttend({
      viewer: 'stranger', audience: 'buddies', expectedOwnerMatches: true,
    })).toBe(false);
    expect(modelCanAttend({
      viewer: 'stranger', audience: 'public', expectedOwnerMatches: true,
    })).toBe(true);
    expect(modelCanAttend({
      viewer: 'buddy', audience: 'buddies', blocked: true, expectedOwnerMatches: true,
    })).toBe(false);
    expect(modelCanAttend({
      viewer: 'buddy', audience: 'buddies', expectedOwnerMatches: false,
    })).toBe(false);
  });

  test('closes direct access to the attendance function before granting authenticated only', () => {
    expect(sql).toMatch(
      /revoke all on function public\.attend_event\(uuid, uuid\) from public, anon, authenticated, service_role/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.attend_event\(uuid, uuid\) to authenticated/,
    );
    expect(sql).not.toMatch(/grant execute on function public\.attend_event\(uuid, uuid\) to anon/);
  });
});
