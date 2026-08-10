import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0097_remove_finance_business.sql',
);

function normalizeSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function dropTablePattern(table: string): RegExp {
  return new RegExp(`\\bdrop table\\b[^;]*\\bpublic\\.${table}\\b`);
}

function dropFunctionPattern(functionName: string): RegExp {
  return new RegExp(`\\bdrop function\\b[^;]*\\bpublic\\.${functionName}\\s*\\(`);
}

function functionDefinition(sql: string, functionName: string): string {
  const start = sql.search(
    new RegExp(`\\bcreate(?: or replace)? function public\\.${functionName}\\s*\\(`),
  );
  expect(start).toBeGreaterThanOrEqual(0);

  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe('0097 finance and business removal migration', () => {
  const sql = normalizeSql(readFileSync(MIGRATION_PATH, 'utf8'));

  test('removes every finance, shared-goal, and business table', () => {
    const removedTables = [
      'money_transactions',
      'bills',
      'accounts',
      'savings_goals',
      'debts',
      'debt_payments',
      'shared_goals',
      'shared_goal_members',
      'shared_goal_contributions',
      'biz_business',
      'biz_item',
      'biz_supply',
      'biz_recipe_line',
      'biz_sale',
      'biz_payment',
      'biz_cost',
      'biz_fixed_cost',
      'biz_loss',
      'biz_customer',
      'biz_tenant',
    ];

    for (const table of removedTables) {
      expect(sql).toMatch(dropTablePattern(table));
    }
  });

  test('does not drop retained social, fitness, food, AI, or moderation tables', () => {
    const retainedTables = [
      'activities',
      'posts',
      'stories',
      'buddy_messages',
      'challenges',
      'challenge_participants',
      'profiles',
      'ai_scans',
      'food_logs',
      'admins',
      'internal_config',
      'moderation_flags',
      'user_sanctions',
      'user_ips',
      'ip_bans',
      'support_messages',
      'buddy_reports',
      'cases',
    ];

    for (const table of retainedTables) {
      expect(sql).not.toMatch(dropTablePattern(table));
    }
  });

  test('deletes receipt scans and narrows retained AI scans to food', () => {
    expect(sql).toMatch(
      /\bdelete from public\.ai_scans where kind\s*=\s*'receipt'\s*;/,
    );
    expect(sql).toMatch(
      /\balter table public\.ai_scans\b[\s\S]*\bcheck\s*\(\s*kind\s*=\s*'food'\s*\)/,
    );
    expect(sql).not.toMatch(dropTablePattern('ai_scans'));
  });

  test('removes finance, shared-goal, and business functions', () => {
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

    for (const functionName of removedFunctions) {
      expect(sql).toMatch(dropFunctionPattern(functionName));
    }
  });

  test('is atomic and replaces metric counts without savings goals', () => {
    expect(sql).toMatch(/^begin\s*;/);
    expect(sql).toMatch(/\bcommit\s*;$/);

    const metricCounts = functionDefinition(sql, 'my_metric_counts');
    expect(metricCounts).not.toMatch(/'goals_hit'/);
    expect(metricCounts).not.toMatch(/\bpublic\.savings_goals\b/);
  });
});
