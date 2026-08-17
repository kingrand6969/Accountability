import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Android comment keyboard contract', () => {
  test('uses native resize mode so the comment composer remains above the keypad', () => {
    const appConfig = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../app.json'), 'utf8'),
    ) as { expo?: { android?: { softwareKeyboardLayoutMode?: string } } };

    expect(appConfig.expo?.android?.softwareKeyboardLayoutMode).toBe('resize');
  });
});
