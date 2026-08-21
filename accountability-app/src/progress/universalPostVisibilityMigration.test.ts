import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0115_universal_post_visibility.sql'),
  'utf8',
);

describe('universal post visibility migration', () => {
  test('is replay-safe and repairs legacy personal rows toward privacy', () => {
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/set local lock_timeout/i);
    expect(sql).toMatch(/drop constraint if exists posts_personal_visibility_check/i);
    expect(sql).toMatch(/update public\.posts[\s\S]*audience = 'buddies'[\s\S]*show_on_card = false/i);
    expect(sql).toMatch(/audience = 'public'[\s\S]*show_on_card is true/i);
    expect(sql).toMatch(/validate constraint posts_personal_visibility_check/i);
    expect(sql).toMatch(/commit;\s*$/i);
  });

  test('allows only the two canonical states for personal posts', () => {
    expect(sql).toMatch(/audience = 'buddies'[\s\S]*show_on_card = false/i);
    expect(sql).toMatch(/audience = 'public'[\s\S]*show_on_card = true/i);
    expect(sql).toMatch(/group_id is not null[\s\S]*page_id is not null/i);
  });

  test('does not touch private progress tables or storage', () => {
    expect(sql).not.toMatch(/body_measurements|progress_photos|storage\.objects/i);
  });
});
