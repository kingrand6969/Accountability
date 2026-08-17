import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0104_buddy_card_presentation.sql'),
  'utf8',
);

function atomicPatchModel(base: unknown, patch: Record<string, unknown>) {
  const objectBase = base && typeof base === 'object' && !Array.isArray(base)
    ? base as Record<string, unknown>
    : {};
  return { ...objectBase, ...patch };
}

describe('atomic Buddy Card patch migration', () => {
  test('uses one owner-bound JSON merge update and safely repairs a malformed base', () => {
    expect(migration).toMatch(/create or replace function public\.patch_my_buddy_card\(\s*p_expected_owner uuid,\s*p_patch jsonb,\s*p_patch_kind text\s*\)/i);
    expect(migration).toMatch(/security invoker[\s\S]*set search_path = ''/i);
    expect(migration).toMatch(/auth\.uid\(\) is null[\s\S]*auth\.uid\(\) <> p_expected_owner/i);
    expect(migration).toMatch(/set buddy_card\s*=\s*\(\s*case[\s\S]*jsonb_typeof\(p\.buddy_card\) = 'object'[\s\S]*else '\{\}'::jsonb[\s\S]*end\s*\)\s*\|\|\s*v_patch/i);
    expect(migration).toMatch(/where p\.id = p_expected_owner[\s\S]*and p\.id = auth\.uid\(\)/i);
    expect(atomicPatchModel('legacy-malformed', { palette_key: 'polar_blue' })).toEqual({
      palette_key: 'polar_blue',
    });
  });

  test('keeps editor and rank keys isolated with explicit allowlists and rejects disallowed keys', () => {
    expect(migration).toMatch(/p_patch_kind = 'editor'[\s\S]*'palette_key'[\s\S]*'featured_medal_ids'[\s\S]*'headline'[\s\S]*'show_posts'/i);
    expect(migration).toMatch(/p_patch_kind = 'editor'[\s\S]*'show_city_rank'[\s\S]*'show_country_rank'/i);
    expect(migration).toMatch(/p_patch_kind = 'rank'[\s\S]*'rank_name'[\s\S]*'medals'[\s\S]*'medals_list'/i);
    expect(migration).toMatch(/jsonb_object_keys\(p_patch\)[\s\S]*raise exception 'Buddy Card patch contains disallowed keys'/i);
    expect(migration).toMatch(/jsonb_typeof\(p_patch\) is distinct from 'object'/i);
  });

  test('interleaved editor and rank writes preserve one another in either order', () => {
    const editor = { palette_key: 'power_violet', featured_medal_ids: ['streak'], show_rank: true };
    const rank = { rank_name: 'Elite', medals: 2, medals_list: [{ id: 'streak', tier: 1 }] };
    expect(atomicPatchModel(atomicPatchModel({ legacy: true }, editor), rank)).toEqual({
      legacy: true,
      ...editor,
      ...rank,
    });
    expect(atomicPatchModel(atomicPatchModel({ legacy: true }, rank), editor)).toEqual({
      legacy: true,
      ...rank,
      ...editor,
    });
  });

  test('is authenticated-only and replay-safe', () => {
    expect(migration).toMatch(/revoke execute on function public\.patch_my_buddy_card\(uuid, jsonb, text\) from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.patch_my_buddy_card\(uuid, jsonb, text\) to authenticated/i);
    expect(migration).not.toMatch(/grant execute on function public\.patch_my_buddy_card\(uuid, jsonb, text\) to anon/i);
  });
});
