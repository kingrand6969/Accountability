import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/0110_buddy_block_read_boundaries.sql',
);
const directQueryPath = path.resolve(
  process.cwd(),
  'supabase/tests/buddy_privacy_boundaries.sql',
);
const presentationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/0104_buddy_card_presentation.sql',
);

const readIfPresent = (filePath: string) =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') : '';

const sql = readIfPresent(migrationPath);
const directQuerySql = readIfPresent(directQueryPath);
const presentationSql = readIfPresent(presentationPath);

const extractPublicProfilesView = (migrationSql: string) =>
  migrationSql.match(
    /create or replace view public\.public_profiles[\s\S]*?from public\.profiles p[\s\S]*?;/i,
  )?.[0] ?? '';

const extractMemberCardStatsFunction = (migrationSql: string) =>
  migrationSql.match(
    /create or replace function public\.member_card_stats\(p_target uuid\)[\s\S]*?\n\$\$;/i,
  )?.[0] ?? '';

const blockViewPredicate = `where p.id = auth.uid()
   or (
     auth.uid() is not null
     and not exists (
       select 1
       from public.buddy_blocks bb
       where (bb.blocker = auth.uid() and bb.blocked = p.id)
          or (bb.blocker = p.id and bb.blocked = auth.uid())
     )
   )`;

const statsBlockGuard = `  if v_caller <> p_target and exists (
    select 1
    from public.buddy_blocks bb
    where (bb.blocker = v_caller and bb.blocked = p_target)
       or (bb.blocker = p_target and bb.blocked = v_caller)
  ) then
    return;
  end if;`;

type Block = Readonly<{ blocker: string; blocked: string }>;

const isBlockedEitherDirection = (viewer: string, target: string, blocks: readonly Block[]) =>
  viewer !== target &&
  blocks.some(
    (block) =>
      (block.blocker === viewer && block.blocked === target) ||
      (block.blocker === target && block.blocked === viewer),
  );

const listProductionSources = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listProductionSources(absolutePath);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
};

describe('Buddy block read-boundary migration', () => {
  test('is a forward migration with a direct disposable-query harness', () => {
    expect(sql).not.toBe('');
    expect(directQuerySql).not.toBe('');
    expect(sql).not.toMatch(/\balter\s+migration\b|\bdelete\s+from\s+supabase_migrations\b/i);
    expect(directQuerySql).toContain('begin;');
    expect(directQuerySql).toContain('rollback;');
  });

  test('filters public_profiles for blocks in either direction while preserving self access', () => {
    const currentView = extractPublicProfilesView(sql);
    expect(currentView).toContain(blockViewPredicate);

    const blocks = [{ blocker: 'viewer', blocked: 'target' }];
    expect(isBlockedEitherDirection('viewer', 'target', blocks)).toBe(true);
    expect(isBlockedEitherDirection('target', 'viewer', blocks)).toBe(true);
    expect(isBlockedEitherDirection('viewer', 'viewer', blocks)).toBe(false);
    expect(isBlockedEitherDirection('other', 'target', blocks)).toBe(false);
  });

  test('indexes both block directions without changing the canonical primary key', () => {
    expect(sql).toContain(
      'create index if not exists buddy_blocks_blocked_blocker_idx\n  on public.buddy_blocks (blocked, blocker);',
    );
    expect(sql).not.toMatch(/alter table public\.buddy_blocks[\s\S]*primary key/i);
  });

  test('changes only the public_profiles row boundary and preserves columns, consent, and security options', () => {
    const baselineView = extractPublicProfilesView(presentationSql);
    const expectedView = baselineView.replace(
      'from public.profiles p;',
      `from public.profiles p\n${blockViewPredicate};`,
    );
    const currentView = extractPublicProfilesView(sql);

    expect(currentView).not.toBe('');
    expect(expectedView).not.toBe(baselineView);
    expect(currentView).toBe(expectedView);
    expect(currentView).toMatch(
      /with \(security_invoker = false, security_barrier = true\)/i,
    );
    expect(currentView).toContain('when p.id = auth.uid() then p.buddy_card');
    expect(currentView).toContain('jsonb_strip_nulls(jsonb_build_object(');
  });

  test('returns no member_card_stats row for either block direction and retains owner metrics', () => {
    const currentFunction = extractMemberCardStatsFunction(sql);
    expect(currentFunction).toContain(statsBlockGuard);

    const rowsVisible = (viewer: string, target: string, blocks: readonly Block[]) =>
      isBlockedEitherDirection(viewer, target, blocks) ? 0 : 1;
    const blocks = [{ blocker: 'viewer', blocked: 'target' }];
    expect(rowsVisible('viewer', 'target', blocks)).toBe(0);
    expect(rowsVisible('target', 'viewer', blocks)).toBe(0);
    expect(rowsVisible('viewer', 'viewer', blocks)).toBe(1);
  });

  test('adds only the block guard to the current member_card_stats implementation', () => {
    const baselineFunction = extractMemberCardStatsFunction(presentationSql);
    const expectedFunction = baselineFunction.replace(
      "  select coalesce(p.buddy_card, '{}'::jsonb)",
      `${statsBlockGuard}\n\n  select coalesce(p.buddy_card, '{}'::jsonb)`,
    );
    const currentFunction = extractMemberCardStatsFunction(sql);

    expect(currentFunction).not.toBe('');
    expect(expectedFunction).not.toBe(baselineFunction);
    expect(currentFunction).toBe(expectedFunction);
    expect(currentFunction).toMatch(
      /returns table\(\s*consistency numeric,\s*points numeric,\s*avgkm numeric,\s*distance numeric,\s*chwin numeric,\s*buddies_rank bigint,\s*buddies_total bigint\s*\)/i,
    );
    expect(currentFunction).toMatch(/security definer\s+set search_path = ''/i);
  });

  test('keeps both read boundaries authenticated-only with no grant widening', () => {
    expect(sql).toContain('revoke all on public.public_profiles from public, anon;');
    expect(sql).toContain('grant select on public.public_profiles to authenticated;');
    expect(sql).toContain(
      'revoke execute on function public.member_card_stats(uuid) from public, anon;',
    );
    expect(sql).toContain(
      'grant execute on function public.member_card_stats(uuid) to authenticated;',
    );

    const grants = sql.match(/^\s*grant\b[^;]*;/gim) ?? [];
    expect(grants.map((grant) => grant.trim())).toEqual([
      'grant select on public.public_profiles to authenticated;',
      'grant execute on function public.member_card_stats(uuid) to authenticated;',
    ]);
    expect(sql).not.toMatch(/\bcascade\b/i);
  });

  test('direct queries prove self access and both blocked directions at both boundaries', () => {
    expect(directQuerySql).toContain("select set_config('request.jwt.claim.sub'");
    expect(directQuerySql).toMatch(
      /select count\(\*\) from public\.public_profiles where id = '[^']+'::uuid/i,
    );
    expect(directQuerySql).toMatch(
      /select count\(\*\) from public\.member_card_stats\('[^']+'::uuid\)/i,
    );
    expect(directQuerySql).toContain('the blocker cannot read the blocked public profile');
    expect(directQuerySql).toContain('the blocked account cannot read the blocker public profile');
    expect(directQuerySql).toContain('the blocker cannot read blocked member-card metrics');
    expect(directQuerySql).toContain('the blocked account cannot read blocker member-card metrics');
    expect(directQuerySql).toContain('self public-profile access remains available');
    expect(directQuerySql).toContain('self member-card metrics remain available');
  });
});

describe('deprecated Buddy Card social-context decommission', () => {
  test('production source has no social-context callers and uses the secure social-proof RPC', () => {
    const sourceRoots = [
      path.resolve(process.cwd(), 'src'),
      path.resolve(process.cwd(), 'supabase/functions'),
    ];
    const sources = sourceRoots
      .flatMap((sourceRoot) => listProductionSources(sourceRoot))
      .map((filePath) => ({
        filePath: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
        source: fs.readFileSync(filePath, 'utf8'),
      }));

    expect(
      sources.filter(({ source }) => source.includes('buddy_card_social_context')),
    ).toEqual([]);
    expect(
      sources
        .filter(({ source }) => source.includes("rpc('buddy_card_social_proof'"))
        .map(({ filePath }) => filePath),
    ).toEqual(['src/buddy/card.ts']);
  });

  test('conditionally revokes every callable role before dropping both historical overloads', () => {
    for (const signature of [
      'public.buddy_card_social_context(uuid)',
      'public.buddy_card_social_context(uuid, uuid)',
    ]) {
      const lookup = `to_regprocedure('${signature}')`;
      const revoke = `revoke execute on function ${signature} from authenticated, anon, public`;
      const drop = `drop function if exists ${signature};`;
      expect(sql).toContain(lookup);
      expect(sql.toLowerCase()).toContain(revoke);
      expect(sql.toLowerCase()).toContain(drop);
      expect(sql.toLowerCase().indexOf(revoke)).toBeLessThan(sql.toLowerCase().indexOf(drop));
    }
  });

  test('does not alter or decommission buddy_card_social_proof', () => {
    expect(sql).not.toMatch(
      /(?:create|replace|drop|revoke|grant)[^;]*buddy_card_social_proof/i,
    );
    expect(directQuerySql).toContain("to_regprocedure('public.buddy_card_social_proof(uuid,uuid)')");
    expect(directQuerySql).toContain('the secure social-proof RPC remains installed');
  });
});
