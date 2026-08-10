import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  process.cwd(), 'supabase', 'migrations', '0101_unified_social_feed.sql',
);

function executableStatements(sql: string): string[] {
  const statements: string[] = [];
  let statement = '';
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === '\n') { lineComment = false; statement += ' '; }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; statement += ' '; }
      continue;
    }
    if (dollarTag) {
      statement += char;
      if (sql.startsWith(dollarTag, index)) {
        statement += dollarTag.slice(1);
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (singleQuoted) {
      statement += char;
      if (char === "'" && next === "'") { statement += next; index += 1; }
      else if (char === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      statement += char;
      if (char === '"' && next === '"') { statement += next; index += 1; }
      else if (char === '"') doubleQuoted = false;
      continue;
    }
    if (char === '-' && next === '-') { lineComment = true; index += 1; }
    else if (char === '/' && next === '*') { blockComment = true; index += 1; }
    else if (char === "'") { singleQuoted = true; statement += char; }
    else if (char === '"') { doubleQuoted = true; statement += char; }
    else if (char === '$') {
      const tag = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (tag) { dollarTag = tag; statement += tag; index += tag.length - 1; }
      else statement += char;
    } else if (char === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
    } else statement += char;
  }
  expect({ singleQuoted, doubleQuoted, blockComment, dollarTag }).toEqual({
    singleQuoted: false, doubleQuoted: false, blockComment: false, dollarTag: null,
  });
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

type ModelSource = 'self' | 'buddy' | 'followed_person' | 'joined_group' | 'followed_page' | 'suggested';
type ModelRow = { id: string; source: ModelSource; createdAt: string; score: number };

function modelPage(rows: ModelRow[], before: { id: string; createdAt: string } | null, limit: number) {
  const priority: Record<Exclude<ModelSource, 'suggested'>, number> = {
    self: 0, buddy: 1, followed_person: 2, joined_group: 3, followed_page: 4,
  };
  const compareWithinTier = (left: ModelRow, right: ModelRow) =>
    right.createdAt.localeCompare(left.createdAt)
      || right.score - left.score
      || left.id.localeCompare(right.id);
  const connections = rows.filter((row) => row.source !== 'suggested').sort((left, right) =>
    priority[left.source as Exclude<ModelSource, 'suggested'>]
      - priority[right.source as Exclude<ModelSource, 'suggested'>]
      || compareWithinTier(left, right));
  const suggestions = rows.filter((row) => row.source === 'suggested').sort(compareWithinTier);
  const sequence: ModelRow[] = [];
  connections.forEach((connection, index) => {
    sequence.push(connection);
    const suggestion = suggestions[Math.floor(index / 4)];
    if ((index + 1) % 4 === 0 && suggestion) sequence.push(suggestion);
  });
  const cursorOrdinal = before === null
    ? -1
    : sequence.findIndex(({ id, createdAt }) => id === before.id && createdAt === before.createdAt);
  if (before !== null && cursorOrdinal < 0) return [];
  return sequence.slice(cursorOrdinal + 1, cursorOrdinal + 1 + Math.max(1, Math.min(limit, 50)))
    .map((row) => ({ ...row }));
}

describe('0101 unified social feed migration', () => {
  const statements = executableStatements(readFileSync(MIGRATION_PATH, 'utf8'));
  const normalized = statements.map(normalize);
  const functionStatement = statements.find((statement) =>
    /^create or replace function public\.unified_feed_post_ids\s*\(/i.test(statement));
  const functionSource = normalize(functionStatement ?? '');
  const pageBody = normalize(functionStatement?.match(/\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)([\s\S]*)\1\s*$/i)?.[2] ?? '');
  const creatorStatement = statements.find((statement) => /^create or replace function public\.create_unified_feed_session\s*\(/i.test(statement));
  const creatorBody = normalize(creatorStatement?.match(/\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)([\s\S]*)\1\s*$/i)?.[2] ?? '');

  test('fails closed on unknown or unrelated destructive top-level statements', () => {
    expect(functionStatement).toBeDefined();
    for (const statement of normalized) {
      const allowed = [
        /^create table if not exists public\.feed_sessions\b/,
        /^create table if not exists public\.feed_session_items\b/,
        /^create (?:unique )?index if not exists [a-z_]+ on public\.(?:feed_sessions|feed_session_items|posts)\b/,
        /^alter table public\.(?:feed_sessions|feed_session_items) enable row level security$/,
        /^drop policy if exists [a-z_]+ on public\.(?:feed_sessions|feed_session_items)$/,
        /^create policy [a-z_]+ on public\.(?:feed_sessions|feed_session_items)\b/,
        /^create or replace function public\.(?:create_unified_feed_session|unified_feed_post_ids)\s*\(/,
        /^drop function if exists public\.unified_feed_post_ids\(timestamptz, uuid, integer\)$/,
        /^revoke all on (?:table public\.(?:feed_sessions|feed_session_items)|function public\.(?:create_unified_feed_session|unified_feed_post_ids)\([^)]*\)) from public, anon(?:, authenticated)?$/,
        /^grant select on table public\.(?:feed_sessions|feed_session_items) to authenticated$/,
        /^grant execute on function public\.(?:create_unified_feed_session|unified_feed_post_ids)\([^)]*\) to authenticated$/,
      ].filter((pattern) => pattern.test(statement));
      expect({ statement, allowed: allowed.length }).toEqual({ statement, allowed: 1 });
      if (!/^drop function if exists public\.unified_feed_post_ids\(timestamptz, uuid, integer\)$/.test(statement)) {
        expect(statement).not.toMatch(/^(?:drop (?:table|schema|database|function|trigger)|truncate|delete|update|insert)\b/);
      }
    }
  });

  test('declares the exact bounded invoker-only page RPC contract', () => {
    expect(functionSource).toMatch(/^create or replace function public\.unified_feed_post_ids\( p_session_id uuid, p_after_position integer, p_limit integer default 20 \) returns table \(session_id uuid, position integer, id uuid, source text, suggested boolean\) language sql stable security invoker set search_path = public as /);
    expect(functionSource).not.toMatch(/security definer|execute\s+format|language\s+plpgsql/);
    expect(pageBody).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
  });

  test('creates owner-scoped snapshot tables with RLS and constrained immutable contents', () => {
    expect(normalized.join(' ')).toMatch(/create table if not exists public\.feed_sessions \( id uuid primary key default gen_random_uuid\(\), user_id uuid not null references public\.profiles \(id\) on delete cascade, created_at timestamptz not null default now\(\), expires_at timestamptz not null default now\(\) \+ interval '30 minutes', snapshot_at timestamptz not null default now\(\)/);
    expect(normalized.join(' ')).toMatch(/create table if not exists public\.feed_session_items \( session_id uuid not null references public\.feed_sessions \(id\) on delete cascade, position integer not null check \(position > 0\), post_id uuid not null references public\.posts \(id\) on delete cascade/);
    expect(normalized.join(' ')).toMatch(/primary key \(session_id, position\)[\s\S]*unique \(session_id, post_id\)/);
    expect(normalized.join(' ')).toMatch(/source text not null check \(source in \('self', 'buddy', 'followed_person', 'joined_group', 'followed_page', 'suggested'\)\)/);
    expect(normalized.join(' ')).toMatch(/check \(suggested = \(source = 'suggested'\)\)/);
    expect(normalized).toEqual(expect.arrayContaining([
      'alter table public.feed_sessions enable row level security',
      'alter table public.feed_session_items enable row level security',
      expect.stringMatching(/^revoke all on table public\.feed_sessions from public, anon, authenticated$/),
      expect.stringMatching(/^revoke all on table public\.feed_session_items from public, anon, authenticated$/),
      'grant select on table public.feed_sessions to authenticated',
      'grant select on table public.feed_session_items to authenticated',
    ]));
    expect(normalized.join(' ')).toMatch(/create policy feed_sessions_select[\s\S]*user_id = auth\.uid\(\)/);
    expect(normalized.join(' ')).toMatch(/create policy feed_session_items_select[\s\S]*s\.user_id = auth\.uid\(\)/);
  });

  test('uses an authenticated definer creator with bounded per-source candidate scans', () => {
    const creator = normalize(statements.find((statement) => /^create or replace function public\.create_unified_feed_session/i.test(statement)) ?? '');
    expect(creator).toMatch(/returns uuid language plpgsql security definer set search_path = public/);
    expect(creator).toMatch(/v_viewer uuid := auth\.uid\(\)/);
    expect(creator).toMatch(/if v_viewer is null then raise exception 'authentication required'/);
    expect(creator).toMatch(/least\(greatest\(coalesce\(p_candidate_limit, 500\), 1\), 1000\)/);
    expect(creator.match(/limit v_per_source/g)?.length).toBeGreaterThanOrEqual(6);
    expect(creator).toMatch(/limit v_candidate_limit/);
    expect(creator).toMatch(/delete from public\.feed_sessions where user_id = v_viewer and expires_at <= now\(\)/);
    expect(creator).toMatch(/insert into public\.feed_sessions \(user_id\) values \(v_viewer\)/);
    expect(creator).not.toMatch(/p_user|security invoker/);
  });

  test('uses the real relationship directions and all five connection tiers', () => {
    expect(creatorBody).toMatch(/'self'::text as source[\s\S]*?p\.user_id = v_viewer/);
    expect(creatorBody).toMatch(/'buddy'::text[\s\S]*?public\.are_buddies\(v_viewer, p\.user_id\)/);
    expect(creatorBody).toMatch(/'followed_person'::text[\s\S]*?public\.buddy_stars s[\s\S]*?s\.starrer=v_viewer and s\.target=p\.user_id/);
    expect(creatorBody).toMatch(/'joined_group'::text[\s\S]*?public\.group_members gm[\s\S]*?gm\.group_id=p\.group_id and gm\.user_id=v_viewer/);
    expect(creatorBody).toMatch(/'followed_page'::text[\s\S]*?public\.page_follows pf[\s\S]*?pf\.page_id=p\.page_id and pf\.user_id=v_viewer/);
    expect(creatorBody).not.toMatch(/'buddy'::text[\s\S]{0,160}p\.group_id is null/);
  });

  test('preserves RLS/moderation and excludes blocks and hides everywhere', () => {
    expect(creatorBody).toMatch(/from public\.posts p/);
    expect(creatorBody).toMatch(/p\.moderation_state = 'visible'/);
    expect(creatorBody).toMatch(/not public\.users_blocked\(v_viewer, p\.user_id\)/);
    expect(creatorBody).toMatch(/p\.user_id=v_viewer or not public\.users_blocked\(v_viewer,p\.user_id\)/);
    expect(creatorBody).toMatch(/p\.page_id is not null or \(p\.group_id is not null[\s\S]*p\.audience='public' or \(p\.audience='buddies' and public\.are_buddies\(p\.user_id, v_viewer\)/);
    expect(pageBody).toMatch(/p\.moderation_state = 'visible'/);
    expect(pageBody).toMatch(/not public\.users_blocked\(auth\.uid\(\), p\.user_id\)/);
    expect(pageBody).toMatch(/public\.post_hides/);
  });

  test('admits only public non-connection suggestions', () => {
    expect(creatorBody).toMatch(/p\.audience = 'public'/);
    expect(creatorBody).toMatch(/p\.user_id <> v_viewer/);
    expect(creatorBody).toMatch(/not public\.are_buddies\(v_viewer,p\.user_id\)/);
    expect(creatorBody).toMatch(/not exists \(select 1 from public\.buddy_stars/);
    expect(creatorBody).toMatch(/not exists \(select 1 from public\.group_members/);
    expect(creatorBody).toMatch(/not exists \(select 1 from public\.page_follows/);
  });

  test('page RPC uses owned, unexpired sessions and position pagination without ranking posts', () => {
    expect(pageBody).toMatch(/from public\.feed_session_items i join public\.feed_sessions s on s\.id = i\.session_id/);
    expect(pageBody).toMatch(/s\.id = p_session_id and s\.user_id = auth\.uid\(\) and s\.expires_at > now\(\)/);
    expect(pageBody).toMatch(/i\.position > greatest\(coalesce\(p_after_position, 0\), 0\)/);
    expect(pageBody).toMatch(/order by i\.position limit least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
    expect(pageBody).not.toMatch(/row_number|rank\(|from public\.posts p/);
  });

  test('rejects cross-user and expired sessions while refresh always creates a new snapshot', () => {
    expect(pageBody).toMatch(/s\.user_id = auth\.uid\(\)/);
    expect(pageBody).toMatch(/s\.expires_at > now\(\)/);
    expect(creatorBody).toMatch(/insert into public\.feed_sessions \(user_id\) values \(v_viewer\) returning id into v_session_id/);
    expect(creatorBody).not.toMatch(/on conflict|select id into v_session_id from public\.feed_sessions/);

    let nextId = 0;
    const create = (owner: string, now: number, rows: ModelRow[]) => ({
      id: `session-${nextId += 1}`, owner, expiresAt: now + 30 * 60_000,
      items: modelPage(rows, null, 1000).map((row, index) => ({ ...row, position: index + 1 })),
    });
    const page = (session: ReturnType<typeof create>, viewer: string, now: number,
      after: number, visible: ReadonlySet<string>) =>
      session.owner === viewer && session.expiresAt > now
        ? session.items.filter(({ id, position }) => position > after && visible.has(id)).slice(0, 50)
        : [];
    const now = Date.parse('2026-08-11T00:00:00Z');
    const rows: ModelRow[] = [
      { id: 'anchor', source: 'self', createdAt: '2026-08-10', score: 0 },
      { id: 'later', source: 'buddy', createdAt: '2026-08-11', score: 0 },
    ];
    const first = create('viewer-a', now, rows);
    const refresh = create('viewer-a', now + 1, rows);
    expect(refresh.id).not.toBe(first.id);
    expect(page(first, 'viewer-b', now, 0, new Set(['anchor', 'later']))).toEqual([]);
    expect(page(first, 'viewer-a', first.expiresAt, 0, new Set(['anchor', 'later']))).toEqual([]);
    expect(page(first, 'viewer-a', now, 1, new Set(['later'])).map(({ id }) => id)).toEqual(['later']);
  });

  test('snapshot model keeps order across deletion, hide and relationship changes', () => {
    const rows: ModelRow[] = [
      { id: '00000000-0000-0000-0000-000000000001', source: 'self', createdAt: '2020-01-01T00:00:00Z', score: 0 },
      { id: '00000000-0000-0000-0000-000000000002', source: 'buddy', createdAt: '2026-01-01T00:00:00Z', score: 10 },
    ];
    const snapshot = modelPage(rows, null, 50);
    rows[1].source = 'self';
    const visibleAfterAnchor = snapshot.filter((_, position) => position + 1 > 1);
    expect(snapshot.map(({ id }) => id)).toEqual([rows[0].id, rows[1].id]);
    expect(visibleAfterAnchor.map(({ id }) => id)).toEqual([rows[1].id]);
    expect(snapshot[1].source).toBe('buddy');
    expect(modelPage([...rows, { id: 's', source: 'suggested', createdAt: '2027-01-01', score: 99 }], null, 50).at(0)?.source).not.toBe('suggested');
    const many = Array.from({ length: 8 }, (_, index): ModelRow => ({
      id: `c${index}`, source: 'buddy', createdAt: `2026-01-0${9 - index}`, score: 0,
    }));
    const suggestions: ModelRow[] = ['s1', 's2', 's3'].map((id) => ({ id, source: 'suggested', createdAt: '2027-01-01', score: 9 }));
    expect(modelPage([...many, ...suggestions], null, 50).filter(({ source }) => source === 'suggested')).toHaveLength(2);
  });

  test('computes engagement from cheers/likes and comments without multiplying rows', () => {
    expect(creatorBody).toMatch(/select count\(\*\) from public\.post_likes pl where pl\.post_id = p\.id/);
    expect(creatorBody).toMatch(/select count\(\*\) from public\.post_comments pc where pc\.post_id = p\.id/);
    expect(creatorBody).not.toMatch(/join public\.(?:post_likes|post_comments)/);
  });

  test('interleaves at most one suggestion after four connections without duplicates or suggestion-only output', () => {
    expect(creatorBody).toMatch(/where d\.candidate_rank = 1/);
    expect(creatorBody).toMatch(/where s\.candidate_rank = 1/);
    expect(creatorBody).toMatch(/s\.candidate_rank = 1 and s\.suggestion_rank <= floor\(cc\.connection_count \/ 4\.0\)/);
    expect(creatorBody).toMatch(/s\.suggestion_rank \* 5 as output_position/);
    expect(creatorBody).toMatch(/c\.connection_rank \+ floor\(\(c\.connection_rank - 1\) \/ 4\.0\) as output_position/);
    expect(creatorBody).toMatch(/cross join connection_count cc[\s\S]*cc\.connection_count > 0/);
  });

  test('does not resurrect removed finance or business objects', () => {
    for (const identifier of ['accounts', 'bills', 'debts', 'money_transactions', 'savings_goals', 'shared_goals', 'biz_business', 'biz_item', 'income_trend']) {
      expect(`${creatorBody} ${pageBody}`).not.toMatch(new RegExp(`\\b${identifier}\\b`));
    }
  });
});
