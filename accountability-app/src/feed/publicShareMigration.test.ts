import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const creatorName = '0117_mantle_public_share_metadata.sql';
const reconciliationName = '0118_reconcile_mantle_public_share_descriptions.sql';
const oldBrand = ['Account', 'Ability'].join('');

function readMigration(name: string): string {
  const path = resolve(migrationsDirectory, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function normalizeStatement(sql: string): string {
  return normalize(sql.replace(/--[^\r\n]*/g, ''));
}

// Lightweight statement scanner: enough to ensure the migration's quotes,
// dollar body and parentheses are balanced and to isolate UPDATE predicates.
function sqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let parentheses = 0;
  let singleQuoted = false;
  let dollarTag: string | null = null;
  let lineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    if (lineComment) {
      if (sql[index] === '\n') lineComment = false;
      continue;
    }
    if (!singleQuoted && !dollarTag && sql.slice(index, index + 2) === '--') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!singleQuoted && !dollarTag && sql[index] === '$') {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length - 1;
        continue;
      }
    } else if (dollarTag && sql.startsWith(dollarTag, index)) {
      index += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }
    if (dollarTag) continue;
    if (sql[index] === "'") {
      if (singleQuoted && sql[index + 1] === "'") {
        index += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }
    if (singleQuoted) continue;
    if (sql[index] === '(') parentheses += 1;
    if (sql[index] === ')') parentheses -= 1;
    if (parentheses < 0) throw new Error('Unbalanced SQL parentheses');
    if (sql[index] === ';' && parentheses === 0) {
      statements.push(sql.slice(start, index + 1).trim());
      start = index + 1;
    }
  }

  if (singleQuoted || dollarTag || parentheses !== 0 || sql.slice(start).trim()) {
    throw new Error('Unbalanced or unterminated SQL');
  }
  return statements;
}

const creatorMigration = readMigration(creatorName);
const reconciliationMigration = readMigration(reconciliationName);
const creatorNormalized = normalize(creatorMigration);
const creatorBody = creatorMigration.match(
  /create\s+or\s+replace\s+function\s+public\.create_public_post_share\s*\([\s\S]*?\)\s*returns\s+uuid[\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/i,
)?.[1] ?? '';

describe('Mantle public-share metadata migrations', () => {
  test('0096 remains historical and 0117 is the latest creator definition', () => {
    const historical = readMigration('0096_ai_moderation_quarantine.sql');
    const definingMigrations = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()
      .filter((name) => /create\s+or\s+replace\s+function\s+public\.create_public_post_share\s*\(/i.test(readMigration(name)));

    expect(historical).toContain(`'A win from ${oldBrand}'`);
    expect(historical).toContain(`'A progress update shared with permission from ${oldBrand}.'`);
    expect(definingMigrations.at(-1)).toBe(creatorName);
  });

  test('0117 rejects null, blank and invalid rendered-card references', () => {
    const body = normalize(creatorBody);
    expect(body).toMatch(
      /if p_preview_ref is null or p_preview_ref !~ '\^r2:\/\/share-cards\/' or split_part\(p_preview_ref, '\/', 4\) <> auth\.uid\(\)::text then/i,
    );
    expect(body).toContain("raise exception 'Invalid share-card reference.' using errcode = '22023';");
  });

  test('0117 preserves the creator API while hardening its definer path', () => {
    expect(creatorNormalized).toMatch(
      /create or replace function public\.create_public_post_share\s*\(\s*p_post uuid,\s*p_preview_ref text\s*\) returns uuid language plpgsql security definer set search_path = '' as \$\$/i,
    );
    expect(normalize(creatorBody)).toMatch(
      /from public\.posts where id = p_post and user_id = auth\.uid\(\) and moderation_state = 'visible'/i,
    );
    expect(normalize(creatorBody)).toMatch(
      /insert into public\.public_shares\s*\(owner_id, post_id, title, description, preview_image_url, preview_image_ref\) values \(auth\.uid\(\), p\.id,[\s\S]*null, p_preview_ref\)/i,
    );
    expect(creatorBody).toContain("'A win from Mantle'");
    expect(creatorBody).toContain("'A progress update shared with permission from Mantle.'");
    expect(creatorBody).not.toContain(oldBrand);
    expect(creatorNormalized).toContain(
      'revoke execute on function public.create_public_post_share(uuid, text) from public, anon;',
    );
    expect(creatorNormalized).toContain(
      'grant execute on function public.create_public_post_share(uuid, text) to authenticated, service_role;',
    );
    expect(creatorNormalized).not.toMatch(/\bupdate\s+public\.public_shares\b/i);
    expect(creatorNormalized).not.toMatch(/(?:create|alter|drop)\s+policy/i);
    expect(sqlStatements(creatorMigration)).toHaveLength(7);
  });

  test('0118 follows 0117 in a separate bounded, writer-draining transaction', () => {
    const names = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const statements = sqlStatements(reconciliationMigration).map(normalizeStatement);

    expect(names.indexOf(reconciliationName)).toBeGreaterThan(names.indexOf(creatorName));
    expect(statements[0]).toBe('begin;');
    expect(statements).toContain("set local lock_timeout = '5s';");
    expect(statements).toContain("set local statement_timeout = '30s';");
    expect(statements).toContain('lock table public.public_shares in share row exclusive mode;');
    expect(statements.at(-1)).toBe('commit;');
  });

  test('0118 updates only exact active system descriptions and never titles', () => {
    const updates = sqlStatements(reconciliationMigration)
      .map(normalizeStatement)
      .filter((statement) => /^update public\.public_shares\b/i.test(statement));
    const expectedMappings = [
      [`Shared from ${oldBrand}`, 'Shared from Mantle'],
      [
        `A progress update shared with permission from ${oldBrand}.`,
        'A progress update shared with permission from Mantle.',
      ],
    ];

    expect(updates).toHaveLength(expectedMappings.length);
    expectedMappings.forEach(([oldDescription, newDescription]) => {
      const update = updates.find((statement) =>
        statement.includes(`set description = '${newDescription}'`),
      );
      expect(update).toBeDefined();
      expect(update).toContain('where revoked_at is null');
      expect(update).toContain('and expires_at > now()');
      expect(update).toContain(`and description = '${oldDescription}'`);
      expect(update?.slice(update.indexOf('where'))).not.toContain(
        `description = '${newDescription}'`,
      );
      expect(update).not.toMatch(/\btitle\b/i);
    });
    expect(normalize(reconciliationMigration)).not.toMatch(/\bset\s+title\b/i);
  });
});
