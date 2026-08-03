import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const billSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0089_atomic_bill_payments.sql'),
  'utf8',
);
const cardSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0090_atomic_card_payments.sql'),
  'utf8',
);

describe('atomic finance payment migration contracts', () => {
  it.each([
    ['bill', billSql],
    ['card', cardSql],
  ])('%s payment rounds to cents before rejecting a zero result', (_name, sql) => {
    expect(sql).toMatch(/v_amount\s*:=\s*round\(p_amount,\s*2\)/i);
    expect(sql).toMatch(/v_amount\s*<=\s*0/i);
    expect(sql.indexOf('v_amount := round')).toBeLessThan(sql.indexOf('v_amount <= 0'));
  });

  it('therefore rejects 0.004 and accepts PostgreSQL numeric round(0.005, 2) as 0.01', () => {
    expect(billSql).toContain('v_amount <= 0');
    expect(billSql).toContain('v_amount');
    expect(cardSql).toContain('v_amount <= 0');
    expect(cardSql).toContain('v_amount');
  });

  it('checks the rounded card amount against the locked current balance', () => {
    expect(cardSql).toMatch(/for update/i);
    expect(cardSql).toMatch(/v_amount\s*>\s*v_debt\.amount/i);
    expect(cardSql).toMatch(/v_debt\.amount\s*-\s*v_amount/i);
  });

  it.each([
    ['bill', billSql],
    ['card', cardSql],
  ])('%s payment is authenticated, owner-scoped and replay-safe', (_name, sql) => {
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/user_id\s*=\s*v_uid/i);
    expect(sql).toMatch(/idempotency_key/i);
    expect(sql).toMatch(/already used for another/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path\s*=\s*''/i);
  });
});
