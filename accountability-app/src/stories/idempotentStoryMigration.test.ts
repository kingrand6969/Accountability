import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0100_idempotent_story_creation.sql'),
  'utf8',
).replace(/\s+/g, ' ').toLowerCase();

describe('idempotent story migration', () => {
  test('binds operation identity to the authenticated expected owner without replacing RLS', () => {
    expect(sql).toContain('unique index if not exists stories_owner_operation_uidx');
    expect(sql).toContain('(user_id, operation_id)');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('auth.uid() <> p_expected_owner');
    expect(sql).toContain('on conflict (user_id, operation_id) where operation_id is not null do nothing');
    expect(sql).not.toContain('disable row level security');
    expect(sql).not.toContain('drop policy');
  });
});
