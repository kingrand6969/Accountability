import { describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/0109_atomic_event_announcements.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const sql = migration.replace(/\s+/g, ' ').toLowerCase();

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
});
