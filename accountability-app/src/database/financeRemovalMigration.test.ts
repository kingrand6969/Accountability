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

function statementStartingWith(statements: string[], prefix: RegExp): string[] {
  return statements.map(normalize).filter((statement) => prefix.test(statement));
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
  const functionReference = new RegExp(`\\bpublic\\.${escapedName}\\s*\\(`);
  const normalized = statements.map(normalize);

  expect(
    normalized.some(
      (statement) =>
        /^revoke\b/.test(statement) &&
        functionReference.test(statement) &&
        /\bfrom public$/.test(statement),
    ),
  ).toBe(true);
  expect(
    normalized.some(
      (statement) =>
        /^grant execute on function\b/.test(statement) &&
        functionReference.test(statement) &&
        /\bto authenticated$/.test(statement),
    ),
  ).toBe(true);
}

describe('0097 finance and business removal migration', () => {
  const statements = executableStatements(readFileSync(MIGRATION_PATH, 'utf8'));
  const normalizedStatements = statements.map(normalize);

  test('has a closed, non-cascading table-drop boundary', () => {
    const allowedDroppedTables = [
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
    const dropStatements = statementStartingWith(statements, /^drop\b/);
    const dropTableStatements = dropStatements.filter((statement) =>
      /^drop table\b/.test(statement),
    );
    const actualDroppedTables = dropTableStatements.flatMap((statement) =>
      [...statement.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/g)].map(
        (match) => match[1],
      ),
    );

    expect([...new Set(actualDroppedTables)].sort()).toEqual(allowedDroppedTables);
    expect(dropTableStatements.length).toBeGreaterThan(0);
    expect(dropStatements.every((statement) => !/\bcascade\b/.test(statement))).toBe(true);
    expect(normalizedStatements.some((statement) => /^drop (schema|database)\b/.test(statement))).toBe(false);
    expect(normalizedStatements.some((statement) => /^truncate\b/.test(statement))).toBe(false);
  });

  test('deletes only the finance-shaped rows from retained mixed-use tables', () => {
    const deletes = statementStartingWith(statements, /^delete from\b/);
    const requiredDeletes: Array<[string, string]> = [
      ['timeline_items', 'expense'],
      ['timeline_items', 'income'],
      ['posts', 'savings'],
      ['ai_scans', 'receipt'],
    ];

    for (const [table, value] of requiredDeletes) {
      const valuePredicate = new RegExp(
        `\\b(?:type|post_type|kind)\\s*(?:=\\s*'${value}'|in\\s*\\([^)]*'${value}')`,
      );
      expect(
        deletes.some(
          (statement) =>
            new RegExp(`^delete from public\\.${table}\\b`).test(statement) &&
            valuePredicate.test(statement),
        ),
      ).toBe(true);
    }

    expect(
      normalizedStatements.some(
        (statement) =>
          /^alter table public\.ai_scans\b/.test(statement) &&
          /\bcheck\s*\(\s*kind\s*=\s*'food'\s*\)/.test(statement),
      ),
    ).toBe(true);
  });

  test('removes finance functions through executable DROP FUNCTION statements', () => {
    const removedFunctions = [
      'mirror_money_tx',
      'income_trend',
      'mark_bill_paid_atomic',
      'pay_card_atomic',
      'is_goal_member',
      'shared_goal_creator_join',
      'biz_item_unit_cost',
      'biz_items_costed',
      'biz_dashboard',
    ];
    const dropFunctions = statementStartingWith(statements, /^drop function\b/);

    for (const functionName of removedFunctions) {
      expect(
        dropFunctions.some((statement) =>
          new RegExp(`\\bpublic\\.${functionName}\\s*\\(`).test(statement),
        ),
      ).toBe(true);
    }
  });

  test('replaces scan quota with its food-only contract and permissions', () => {
    const body = dollarQuotedBody(functionStatement(statements, 'my_scan_quota'));

    expect(body).toMatch(/'limit'/);
    expect(body).toMatch(/'food_used'/);
    expect(body).not.toMatch(/\breceipt\b/);
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
    expect(body).not.toMatch(/'goals_hit'/);
    expect(body).not.toMatch(/\bpublic\.savings_goals\b/);
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
