import fs from 'fs';
import path from 'path';
import { expect, test } from '@jest/globals';

test('AI scan edge function accepts and stores food scans only', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/ai-scan/index.ts'),
    'utf8',
  );
  expect(source).toContain("if (kind !== 'food')");
  expect(source).toContain("insert({ user_id: user.id, kind: 'food' })");
  expect(source).not.toMatch(/RECEIPT_PROMPT|kind === 'receipt'|kind !== 'receipt'|Read this receipt/i);
});
