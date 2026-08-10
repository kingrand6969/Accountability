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

describe('0101 unified social feed migration', () => {
  const statements = executableStatements(readFileSync(MIGRATION_PATH, 'utf8'));
  const normalized = statements.map(normalize);
  const functionStatement = statements.find((statement) =>
    /^create or replace function public\.unified_feed_post_ids\s*\(/i.test(statement));
  const functionSource = normalize(functionStatement ?? '');
  const body = normalize(functionStatement?.match(/\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)([\s\S]*)\1\s*$/i)?.[2] ?? '');

  test('fails closed on unknown or destructive top-level statements', () => {
    expect(statements).toHaveLength(3);
    expect(functionStatement).toBeDefined();
    expect(normalized).toEqual(expect.arrayContaining([
      expect.stringMatching(/^revoke all on function public\.unified_feed_post_ids\(timestamptz, uuid, integer\) from public, anon$/),
      expect.stringMatching(/^grant execute on function public\.unified_feed_post_ids\(timestamptz, uuid, integer\) to authenticated$/),
    ]));
    for (const statement of normalized) {
      const allowed = [
        /^create or replace function public\.unified_feed_post_ids\s*\(/,
        /^revoke all on function public\.unified_feed_post_ids\(timestamptz, uuid, integer\) from public, anon$/,
        /^grant execute on function public\.unified_feed_post_ids\(timestamptz, uuid, integer\) to authenticated$/,
      ].filter((pattern) => pattern.test(statement));
      expect({ statement, allowed: allowed.length }).toEqual({ statement, allowed: 1 });
      expect(statement).not.toMatch(/^(?:drop|delete|truncate|alter|update|insert)\b/);
    }
  });

  test('declares the exact bounded invoker-only RPC contract', () => {
    expect(functionSource).toMatch(/^create or replace function public\.unified_feed_post_ids\( p_before timestamptz, p_before_id uuid, p_limit integer default 20 \) returns table \(id uuid, source text, suggested boolean\) language sql stable security invoker set search_path = public as /);
    expect(functionSource).not.toMatch(/security definer|execute\s+format|language\s+plpgsql/);
    expect(body).toMatch(/least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
  });

  test('uses the real relationship directions and all five connection tiers', () => {
    expect(body).toMatch(/p\.user_id = auth\.uid\(\)[\s\S]*'self'/);
    expect(body).toMatch(/public\.are_buddies\(auth\.uid\(\), p\.user_id\)[\s\S]*'buddy'/);
    expect(body).toMatch(/public\.buddy_stars s[\s\S]*s\.starrer = auth\.uid\(\)[\s\S]*s\.target = p\.user_id[\s\S]*'followed_person'/);
    expect(body).toMatch(/public\.group_members gm[\s\S]*gm\.group_id = p\.group_id[\s\S]*gm\.user_id = auth\.uid\(\)[\s\S]*'joined_group'/);
    expect(body).toMatch(/public\.page_follows pf[\s\S]*pf\.page_id = p\.page_id[\s\S]*pf\.user_id = auth\.uid\(\)[\s\S]*'followed_page'/);
    expect(body).toMatch(/case c\.source when 'self' then 0 when 'buddy' then 1 when 'followed_person' then 2 when 'joined_group' then 3 when 'followed_page' then 4 end/);
  });

  test('preserves RLS/moderation and excludes blocks and hides everywhere', () => {
    expect(body).toMatch(/from public\.posts p/);
    expect(body).toMatch(/p\.moderation_state = 'visible'/);
    expect(body).toMatch(/not public\.users_blocked\(auth\.uid\(\), p\.user_id\)/);
    expect(body).toMatch(/not exists \( select 1 from public\.post_hides h where h\.post_id = p\.id and h\.user_id = auth\.uid\(\) \)/);
    expect(body.match(/post_hides/g)).toHaveLength(1);
  });

  test('admits only public non-connection suggestions', () => {
    expect(body).toMatch(/p\.audience = 'public'/);
    expect(body).toMatch(/p\.user_id <> auth\.uid\(\)/);
    expect(body).toMatch(/not public\.are_buddies\(auth\.uid\(\), p\.user_id\)/);
    expect(body).toMatch(/not exists \( select 1 from public\.buddy_stars/);
    expect(body).toMatch(/not exists \( select 1 from public\.group_members/);
    expect(body).toMatch(/not exists \( select 1 from public\.page_follows/);
  });

  test('uses a complete stable keyset cursor and deterministic ordering', () => {
    expect(body).toMatch(/\(p_before is null and p_before_id is null\) or \(\s*p_before is not null and p_before_id is not null and \(p\.created_at, p\.id\) < \(p_before, p_before_id\)\s*\)/);
    expect(body.match(/partition by [cs]\.id order by/g)).toHaveLength(2);
    expect(body).toMatch(/c\.created_at desc, c\.id desc/);
    expect(body).toMatch(/s\.created_at desc, s\.id desc/);
    expect(body).toMatch(/order by i\.output_position, i\.id desc/);
  });

  test('interleaves at most one suggestion after four connections without duplicates or suggestion-only output', () => {
    expect(body).toMatch(/where c\.candidate_rank = 1/);
    expect(body).toMatch(/where s\.candidate_rank = 1/);
    expect(body).toMatch(/where s\.suggestion_rank <= floor\(cc\.connection_count \/ 4\.0\)/);
    expect(body).toMatch(/s\.suggestion_rank \* 5 as output_position/);
    expect(body).toMatch(/c\.connection_rank \+ floor\(\(c\.connection_rank - 1\) \/ 4\.0\) as output_position/);
    expect(body).toMatch(/cross join connection_count cc[\s\S]*cc\.connection_count > 0/);
    expect(body).toMatch(/limit \(select value from bounded_limit\)/);
  });

  test('does not resurrect removed finance or business objects', () => {
    for (const identifier of ['accounts', 'bills', 'debts', 'money_transactions', 'savings_goals', 'shared_goals', 'biz_business', 'biz_item', 'income_trend']) {
      expect(body).not.toMatch(new RegExp(`\\b${identifier}\\b`));
    }
  });
});
