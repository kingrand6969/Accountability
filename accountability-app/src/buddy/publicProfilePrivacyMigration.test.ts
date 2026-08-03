import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

describe('public profile privacy migration', () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/0088_public_profiles_buddy_card_privacy.sql'),
    'utf8',
  );

  test('uses a strict Buddy Card allowlist and a security barrier', () => {
    expect(sql).toContain('security_barrier = true');
    expect(sql).toContain('jsonb_build_object(');
    expect(sql).not.toContain("coalesce(p.buddy_card, '{}'::jsonb)\n      -");
  });

  test('requires both last-active consent controls for non-owners', () => {
    expect(sql).toContain('p.show_last_active');
    expect(sql).toContain("p.buddy_card -> 'show_last_active'");
  });

  test('does not grant anonymous access', () => {
    expect(sql).toContain('revoke all on public.public_profiles from public, anon');
    expect(sql).toContain('grant select on public.public_profiles to authenticated');
  });
});
