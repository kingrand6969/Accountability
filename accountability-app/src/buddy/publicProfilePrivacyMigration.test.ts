import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/0097_buddy_card_presentation.sql',
);
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
const privacyBaselineSql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0088_public_profiles_buddy_card_privacy.sql'),
  'utf8',
);

const extractPublicProfilesView = (migrationSql: string) =>
  migrationSql.match(
    /create or replace view public\.public_profiles[\s\S]*?from public\.profiles p;/i,
  )?.[0] ?? '';

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, '\n');
const presentationAdditions = `,
        'palette_key',
          case
            when p.buddy_card ->> 'palette_key' in (
              'polar_blue',
              'victory_ember',
              'momentum_teal',
              'power_violet'
            ) then p.buddy_card ->> 'palette_key'
            else 'polar_blue'
          end,
        'featured_medal_ids',
          case when coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
            then p.buddy_card -> 'featured_medal_ids' else null end`;
const headlineConsentGate = `case when coalesce(p.buddy_card -> 'show_headline' = 'true'::jsonb, false)
            then p.buddy_card -> 'headline' else null end`;

const stripPresentationAdditions = (viewSql: string) =>
  normalizeLineEndings(viewSql).replace(presentationAdditions, '');
const remediationSql =
  sql.match(
    /with invalid_buddy_card_presentation as \([\s\S]*?update public\.profiles[\s\S]*?;/i,
  )?.[0] ?? '';
const presentationConstraintSql =
  sql.match(
    /add constraint profiles_buddy_card_presentation_check[\s\S]*?\) not valid;/i,
  )?.[0] ?? '';

describe('Buddy Card presentation migration', () => {
  test('replaces and validates a replay-safe presentation constraint', () => {
    expect(sql).toMatch(
      /alter table public\.profiles\s+drop constraint if exists profiles_buddy_card_presentation_check/i,
    );
    expect(sql).toMatch(
      /add constraint profiles_buddy_card_presentation_check[\s\S]*check\s*\([\s\S]*\)\s*not valid/i,
    );
    expect(sql).toMatch(
      /alter table public\.profiles\s+validate constraint profiles_buddy_card_presentation_check/i,
    );
  });

  test('allows an absent palette and otherwise enforces the exact palette allowlist', () => {
    expect(sql).toMatch(/not\s*\(buddy_card\s*\?\s*'palette_key'\)\s+or\s*\(/i);
    expect(sql).toMatch(/jsonb_typeof\(buddy_card\s*->\s*'palette_key'\)\s*=\s*'string'/i);

    const paletteAllowlist = sql.match(
      /buddy_card\s*->>\s*'palette_key'\s+in\s*\(([^)]+)\)/i,
    )?.[1];
    expect(paletteAllowlist?.match(/'[^']+'/g)).toEqual([
      "'polar_blue'",
      "'victory_ember'",
      "'momentum_teal'",
      "'power_violet'",
    ]);
  });

  test('uses a type-safe CASE before checking featured medal count and item types', () => {
    expect(sql).toMatch(/not\s*\(buddy_card\s*\?\s*'featured_medal_ids'\)\s+or\s+case/i);
    expect(sql).toMatch(
      /case\s+when jsonb_typeof\(buddy_card\s*->\s*'featured_medal_ids'\)\s*=\s*'array'\s+then[\s\S]*?jsonb_array_length\(buddy_card\s*->\s*'featured_medal_ids'\)\s*<=\s*4[\s\S]*?else false\s+end/i,
    );
    expect(sql).toMatch(
      /not jsonb_path_exists\(\s*buddy_card\s*->\s*'featured_medal_ids',[\s\S]*?type\(\)\s*!=\s*"string"[\s\S]*?\)/i,
    );

    const unsafeLengthCheck =
      /jsonb_array_length\(buddy_card\s*->\s*'featured_medal_ids'\)[\s\S]*?jsonb_typeof\(buddy_card\s*->\s*'featured_medal_ids'\)\s*=\s*'array'/i;
    expect(presentationConstraintSql).not.toMatch(unsafeLengthCheck);
  });

  test('remediates existing invalid reserved keys after adding and before validating the constraint', () => {
    const addConstraintAt = sql.search(
      /add constraint profiles_buddy_card_presentation_check[\s\S]*?not valid/i,
    );
    const remediationAt = sql.indexOf(remediationSql);
    const validateAt = sql.search(
      /validate constraint profiles_buddy_card_presentation_check/i,
    );

    expect(remediationSql).not.toBe('');
    expect(addConstraintAt).toBeGreaterThanOrEqual(0);
    expect(remediationAt).toBeGreaterThan(addConstraintAt);
    expect(validateAt).toBeGreaterThan(remediationAt);
  });

  test('removes explicit-null, non-string, and unapproved palettes while retaining valid palettes', () => {
    expect(remediationSql).toMatch(
      /buddy_card \? 'palette_key'\s+and not \(\s*jsonb_typeof\(buddy_card -> 'palette_key'\) = 'string'[\s\S]*?buddy_card ->> 'palette_key' in \([\s\S]*?'polar_blue'[\s\S]*?'victory_ember'[\s\S]*?'momentum_teal'[\s\S]*?'power_violet'[\s\S]*?\)\s*\) as remove_palette/i,
    );
    expect(remediationSql).toMatch(
      /when r\.remove_palette and r\.remove_featured then\s+p\.buddy_card - 'palette_key' - 'featured_medal_ids'/i,
    );
    expect(remediationSql).toMatch(
      /when r\.remove_palette then p\.buddy_card - 'palette_key'/i,
    );
  });

  test('removes null, wrong-type, non-string, and oversized featured medal selections', () => {
    expect(remediationSql).toMatch(
      /buddy_card \? 'featured_medal_ids'\s+and not \(\s*case\s+when jsonb_typeof\(buddy_card -> 'featured_medal_ids'\) = 'array' then[\s\S]*?jsonb_array_length\(buddy_card -> 'featured_medal_ids'\) <= 4[\s\S]*?not jsonb_path_exists\([\s\S]*?type\(\) != "string"[\s\S]*?else false\s+end\s*\) as remove_featured/i,
    );
    expect(remediationSql).toMatch(
      /when r\.remove_featured then p\.buddy_card - 'featured_medal_ids'/i,
    );
  });

  test('bounds remediation to invalid reserved keys and preserves unrelated keys and valid values', () => {
    expect(remediationSql).toMatch(
      /where buddy_card \? 'palette_key'\s+or buddy_card \? 'featured_medal_ids'/i,
    );
    expect(remediationSql).toMatch(
      /where p\.id = r\.id\s+and \(r\.remove_palette or r\.remove_featured\)/i,
    );
    expect(remediationSql).not.toMatch(/jsonb_build_object|jsonb_strip_nulls|\|\||'\{\}'::jsonb/i);

    const removedKeys = [
      ...remediationSql.matchAll(/p\.buddy_card\s*-\s*'([^']+)'/gi),
    ].map((match) => match[1]);
    expect(new Set(removedKeys)).toEqual(new Set(['palette_key', 'featured_medal_ids']));
  });

  test('recreates the public profile view with its security barrier and strict allowlist additions', () => {
    expect(sql).toMatch(
      /create or replace view public\.public_profiles\s+with \(security_invoker = false, security_barrier = true\)/i,
    );
    expect(sql).toContain('jsonb_build_object(');
    expect(sql).not.toMatch(/coalesce\(p\.buddy_card,\s*'\{\}'::jsonb\)\s*(?:-|\|\|)/i);
    expect(sql).toMatch(/'palette_key',\s*case[\s\S]*?else 'polar_blue'\s*end/i);
    expect(sql).toMatch(
      /'featured_medal_ids',\s*case when coalesce\(p\.buddy_card -> 'show_medals' = 'true'::jsonb, false\)\s*then p\.buddy_card -> 'featured_medal_ids' else null end/i,
    );
  });

  test('returns the full Buddy Card to owners and only exposes featured medals with medal consent', () => {
    expect(sql).toMatch(/when p\.id = auth\.uid\(\) then p\.buddy_card/i);
    expect(sql).toMatch(
      /'show_medals',[\s\S]*?'medals',[\s\S]*?'medals_list',[\s\S]*?'featured_medal_ids',[\s\S]*?'show_consistency'/i,
    );
  });

  test('preserves the key 0088 public profile privacy gates', () => {
    expect(sql).toMatch(/p\.birthday_private then null::date else p\.birthday/i);
    expect(sql).toMatch(/p\.gender_private then null::text else p\.gender/i);
    expect(sql).toMatch(
      /p\.sexual_orientation_private then null::text\s+else p\.sexual_orientation/i,
    );
    expect(sql).toMatch(
      /p\.id = auth\.uid\(\)[\s\S]*?p\.show_last_active[\s\S]*?p\.buddy_card -> 'show_last_active'[\s\S]*?then p\.last_active_at/i,
    );
    expect(sql).toMatch(
      /p\.buddy_card -> 'show_area'[\s\S]*?then p\.area[\s\S]*?p\.buddy_card -> 'show_hero'[\s\S]*?then p\.cover_url[\s\S]*?p\.buddy_card -> 'show_bio'[\s\S]*?then p\.bio/i,
    );
  });

  test('preserves the complete 0088 view boundary except for the presentation additions', () => {
    const currentView = normalizeLineEndings(extractPublicProfilesView(sql));
    const baselineView = normalizeLineEndings(extractPublicProfilesView(privacyBaselineSql));

    expect(currentView.split(presentationAdditions)).toHaveLength(2);
    expect(stripPresentationAdditions(currentView)).toBe(baselineView);
  });

  test('the 0088 comparison rejects unconditional headline exposure', () => {
    const currentView = normalizeLineEndings(extractPublicProfilesView(sql));
    const baselineView = normalizeLineEndings(extractPublicProfilesView(privacyBaselineSql));
    const unsafeHeadlineView = currentView.replace(
      headlineConsentGate,
      "p.buddy_card -> 'headline'",
    );

    expect(unsafeHeadlineView).not.toBe(currentView);
    expect(stripPresentationAdditions(unsafeHeadlineView)).not.toBe(baselineView);
  });

  test('keeps the view authenticated-only without widening destructive scope', () => {
    expect(sql).toContain('revoke all on public.public_profiles from public, anon');
    expect(sql).toContain('grant select on public.public_profiles to authenticated');

    const grants = sql.match(/^\s*grant\b[^;]*;/gim) ?? [];
    expect(grants.map((grant) => grant.trim())).toEqual([
      'grant select on public.public_profiles to authenticated;',
    ]);
    expect(sql).not.toMatch(/\bcascade\b/i);
    expect(sql).not.toMatch(/\bexecute\b/i);
    expect(sql).not.toMatch(/\bsecurity\s+definer\b/i);
  });
});
