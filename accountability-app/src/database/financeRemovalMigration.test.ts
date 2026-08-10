import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0097_remove_finance_business.sql',
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
      if (char === '\n') {
        lineComment = false;
        statement += ' ';
      }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
        statement += ' ';
      }
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
      if (char === "'" && next === "'") {
        statement += next;
        index += 1;
      } else if (char === "'") {
        singleQuoted = false;
      }
      continue;
    }
    if (doubleQuoted) {
      statement += char;
      if (char === '"' && next === '"') {
        statement += next;
        index += 1;
      } else if (char === '"') {
        doubleQuoted = false;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else if (char === "'") {
      singleQuoted = true;
      statement += char;
    } else if (char === '"') {
      doubleQuoted = true;
      statement += char;
    } else if (char === '$') {
      const tag = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0];
      if (tag) {
        dollarTag = tag;
        statement += tag;
        index += tag.length - 1;
      } else {
        statement += char;
      }
    } else if (char === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
    } else {
      statement += char;
    }
  }

  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

function normalize(statement: string): string {
  return statement.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitTopLevelCommaList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function functionStatement(statements: string[], functionName: string): string {
  const pattern = new RegExp(
    `^create or replace function public\\.${functionName}\\s*\\(`,
  );
  const statement = statements.find((candidate) => pattern.test(normalize(candidate)));
  expect(statement).toBeDefined();
  return statement as string;
}

function dollarQuotedBody(statement: string): string {
  const match = statement.match(/\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)([\s\S]*)\1\s*$/i);
  expect(match).not.toBeNull();
  return normalize(match?.[2] ?? '');
}

function expectExecutePermissions(statements: string[], functionName: string): void {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalized = statements.map(normalize);
  const revoke = new RegExp(
    `^revoke all on function public\\.${escapedName}\\(\\) from public$`,
  );
  const grant = new RegExp(
    `^grant execute on function public\\.${escapedName}\\(\\) to authenticated$`,
  );

  expect(normalized.filter((statement) => revoke.test(statement))).toHaveLength(1);
  expect(normalized.filter((statement) => grant.test(statement))).toHaveLength(1);
}

const REMOVED_TABLES = [
  'accounts',
  'bills',
  'biz_business',
  'biz_cost',
  'biz_customer',
  'biz_fixed_cost',
  'biz_item',
  'biz_loss',
  'biz_payment',
  'biz_recipe_line',
  'biz_sale',
  'biz_supply',
  'biz_tenant',
  'debt_payments',
  'debts',
  'money_transactions',
  'savings_goals',
  'shared_goal_contributions',
  'shared_goal_members',
  'shared_goals',
];

const REMOVED_FUNCTION_SIGNATURES = [
  'public.biz_dashboard(uuid,date,date)',
  'public.biz_item_unit_cost(uuid,int)',
  'public.biz_items_costed(uuid)',
  'public.income_trend(int)',
  'public.is_goal_member(uuid,uuid)',
  'public.mark_bill_paid_atomic(uuid,numeric,uuid)',
  'public.mirror_money_tx()',
  'public.pay_card_atomic(uuid,numeric,uuid)',
  'public.shared_goal_creator_join()',
];

const DESTRUCTIVE_PREFIX = /^(?:drop\s+(?:table|schema|database|function|trigger)\b|delete\s+from\b|truncate\b|alter\s+table\b)/;
const APPROVED_AI_SCANS_ALTER = /^alter table public\.ai_scans (?:drop constraint(?: if exists)? [a-z_][a-z0-9_]*|add constraint [a-z_][a-z0-9_]* check\s*\(\s*kind\s*=\s*'food'\s*\))$/;

function dropTableTargets(statement: string): string[] | null {
  const match = statement.match(/^drop table(?: if exists)? (.+)$/);
  if (!match) return null;
  const targets = splitTopLevelCommaList(match[1]);
  if (targets.some((target) => !/^public\.[a-z_][a-z0-9_]*$/.test(target))) return null;
  return targets.map((target) => target.slice('public.'.length));
}

function normalizeFunctionSignature(signature: string): string {
  return signature.replace(/\binteger\b/g, 'int').replace(/\s+/g, '');
}

function dropFunctionTargets(statement: string): string[] | null {
  const match = statement.match(/^drop function(?: if exists)? (.+)$/);
  if (!match) return null;
  const targets = splitTopLevelCommaList(match[1]).map(normalizeFunctionSignature);
  if (
    targets.some(
      (target) =>
        !/^public\.[a-z_][a-z0-9_]*\((?:[a-z_]+(?:,[a-z_]+)*)?\)$/.test(target),
    )
  ) {
    return null;
  }
  return targets;
}

function isApprovedDelete(statement: string): boolean {
  if (/^delete from public\.posts where post_type\s*=\s*'savings'$/.test(statement)) {
    return true;
  }
  if (/^delete from public\.ai_scans where kind\s*=\s*'receipt'$/.test(statement)) {
    return true;
  }
  const timeline = statement.match(
    /^delete from public\.timeline_items where type in\s*\(([^)]*)\)$/,
  );
  if (!timeline) return false;
  const values = timeline[1]
    .split(',')
    .map((value) => value.trim().match(/^'([a-z_]+)'$/)?.[1])
    .sort();
  return JSON.stringify(values) === JSON.stringify(['expense', 'income']);
}

function expectNoRemovedIdentifiers(body: string): void {
  const removedIdentifiers = [
    ...REMOVED_TABLES,
    ...REMOVED_FUNCTION_SIGNATURES.map((signature) =>
      signature.slice('public.'.length, signature.indexOf('(')),
    ),
    'goals_hit',
  ];
  for (const identifier of removedIdentifiers) {
    expect(body).not.toMatch(new RegExp(`\\b${identifier}\\b`));
  }
}

describe('0097 finance and business removal migration', () => {
  const statements = executableStatements(readFileSync(MIGRATION_PATH, 'utf8'));
  const normalizedStatements = statements.map(normalize);

  test('rejects every unreviewed top-level executable statement', () => {
    const allowedTables = new Set(REMOVED_TABLES);
    const allowedFunctions = new Set(REMOVED_FUNCTION_SIGNATURES);
    const replacementFunction =
      /^create or replace function public\.(?:my_scan_quota|my_metric_counts)\s*\(\)/;
    const replacementPermission =
      /^(?:revoke all on function public\.(?:my_scan_quota|my_metric_counts)\(\) from public|grant execute on function public\.(?:my_scan_quota|my_metric_counts)\(\) to authenticated)$/;
    const approvedTrigger =
      /^drop trigger(?: if exists)? money_tx_mirror on public\.money_transactions$/;

    for (const statement of normalizedStatements) {
      const tableTargets = dropTableTargets(statement);
      const functionTargets = dropFunctionTargets(statement);
      const categories = [
        statement === 'begin',
        statement === 'commit',
        isApprovedDelete(statement),
        APPROVED_AI_SCANS_ALTER.test(statement),
        replacementFunction.test(statement),
        replacementPermission.test(statement),
        approvedTrigger.test(statement),
        functionTargets !== null &&
          functionTargets.length > 0 &&
          functionTargets.every((target) => allowedFunctions.has(target)),
        tableTargets !== null &&
          tableTargets.length > 0 &&
          tableTargets.every((target) => allowedTables.has(target)),
      ];

      expect({ statement, matchingCategories: categories.filter(Boolean).length }).toEqual({
        statement,
        matchingCategories: 1,
      });
    }
  });

  test('allowlists every executable destructive statement', () => {
    const destructiveStatements = normalizedStatements.filter((statement) =>
      DESTRUCTIVE_PREFIX.test(statement),
    );
    expect(destructiveStatements).not.toContainEqual(expect.stringMatching(/\bcascade\b/));
    expect(destructiveStatements.filter((statement) => /^drop (schema|database)\b/.test(statement))).toEqual([]);
    expect(destructiveStatements.filter((statement) => /^truncate\b/.test(statement))).toEqual([]);

    const dropTables = destructiveStatements.filter((statement) => /^drop table\b/.test(statement));
    const droppedTables: string[] = [];
    for (const statement of dropTables) {
      const targets = dropTableTargets(statement);
      expect(targets).not.toBeNull();
      droppedTables.push(...(targets ?? []));
    }
    expect(droppedTables.sort()).toEqual(REMOVED_TABLES);

    const deletes = destructiveStatements.filter((statement) => /^delete from\b/.test(statement));
    expect(deletes).toHaveLength(3);
    const timelineDelete = deletes.find((statement) =>
      /^delete from public\.timeline_items where type in\b/.test(statement),
    );
    const timelineValues = timelineDelete
      ?.match(/^delete from public\.timeline_items where type in\s*\(([^)]*)\)$/)?.[1]
      .split(',')
      .map((value) => value.trim().match(/^'([a-z_]+)'$/)?.[1])
      .sort();
    expect(timelineValues).toEqual(['expense', 'income']);
    expect(deletes.filter((statement) => /^delete from public\.posts where post_type\s*=\s*'savings'$/.test(statement))).toHaveLength(1);
    expect(deletes.filter((statement) => /^delete from public\.ai_scans where kind\s*=\s*'receipt'$/.test(statement))).toHaveLength(1);

    const alters = destructiveStatements.filter((statement) => /^alter table\b/.test(statement));
    expect(alters.length).toBeGreaterThanOrEqual(2);
    expect(
      alters.every((statement) =>
        APPROVED_AI_SCANS_ALTER.test(statement),
      ),
    ).toBe(true);
    expect(alters.some((statement) => / drop constraint(?: if exists)? /.test(statement))).toBe(true);
    expect(alters.some((statement) => / add constraint /.test(statement))).toBe(true);

    const dropFunctions = destructiveStatements.filter((statement) => /^drop function\b/.test(statement));
    const droppedFunctions: string[] = [];
    for (const statement of dropFunctions) {
      const targets = dropFunctionTargets(statement);
      expect(targets).not.toBeNull();
      droppedFunctions.push(...(targets ?? []));
    }
    expect(droppedFunctions.sort()).toEqual(REMOVED_FUNCTION_SIGNATURES);

    const dropTriggers = destructiveStatements.filter((statement) => /^drop trigger\b/.test(statement));
    expect(dropTriggers).toHaveLength(1);
    expect(dropTriggers[0]).toMatch(
      /^drop trigger(?: if exists)? money_tx_mirror on public\.money_transactions$/,
    );

    const accountedCount =
      dropTables.length + deletes.length + alters.length + dropFunctions.length + dropTriggers.length;
    expect(accountedCount).toBe(destructiveStatements.length);
  });

  test('replaces scan quota with its food-only contract and permissions', () => {
    const body = dollarQuotedBody(functionStatement(statements, 'my_scan_quota'));

    expect(body).toMatch(/'limit'/);
    expect(body).toMatch(/'food_used'/);
    expect(body).toMatch(/\bfrom public\.ai_scans\b/);
    expect(body).toMatch(/\buser_id\s*=\s*auth\.uid\(\)/);
    expect(body).toMatch(/\bkind\s*=\s*'food'/);
    expect(body).toMatch(/\bcreated_at\s*>=\s*date_trunc\('month',\s*now\(\)\)/);
    expect(body).not.toMatch(/\breceipt\b/);
    expectNoRemovedIdentifiers(body);
    expectExecutePermissions(statements, 'my_scan_quota');
  });

  test('replaces metric counts without the removed savings metric', () => {
    const body = dollarQuotedBody(functionStatement(statements, 'my_metric_counts'));
    const retainedKeys = [
      'workouts',
      'challenges',
      'memories',
      'places',
      'posts',
      'likes',
      'groups',
      'messages',
      'profile_fields',
    ];

    for (const key of retainedKeys) expect(body).toMatch(new RegExp(`'${key}'`));
    const canonicalSources = [
      /'workouts'[\s\S]*?from public\.timeline_items where user_id = auth\.uid\(\) and type = 'workout'/,
      /'challenges'[\s\S]*?from public\.challenge_participants where user_id = auth\.uid\(\)/,
      /'memories'[\s\S]*?from public\.memories where user_id = auth\.uid\(\)/,
      /'places'[\s\S]*?from public\.memories where user_id = auth\.uid\(\) and location is not null/,
      /'posts'[\s\S]*?from public\.posts where user_id = auth\.uid\(\)/,
      /'likes'[\s\S]*?from public\.post_likes where user_id = auth\.uid\(\)/,
      /'groups'[\s\S]*?from public\.group_members where user_id = auth\.uid\(\)/,
      /'messages'[\s\S]*?from public\.buddy_messages where sender = auth\.uid\(\)/,
      /'profile_fields'[\s\S]*?avatar_url[\s\S]*?bio[\s\S]*?display_name[\s\S]*?from public\.profiles where id = auth\.uid\(\)/,
    ];
    for (const source of canonicalSources) expect(body).toMatch(source);
    expectNoRemovedIdentifiers(body);
    expectExecutePermissions(statements, 'my_metric_counts');
  });

  test('uses one transaction spanning the complete migration', () => {
    const transactionStatements = normalizedStatements.filter((statement) =>
      /^(?:begin|start transaction|commit|rollback|savepoint|release|end)\b/.test(statement),
    );

    expect(normalizedStatements[0]).toBe('begin');
    expect(normalizedStatements.at(-1)).toBe('commit');
    expect(transactionStatements).toEqual(['begin', 'commit']);
  });
});
