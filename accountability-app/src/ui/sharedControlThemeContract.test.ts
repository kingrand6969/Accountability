import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('shared controls follow the active app appearance', () => {
  test.each([
    './Checkbox',
    './PrivacyToggle',
    '../profiles/ChipSelector',
  ])('%s consumes semantic Light/Dark roles instead of the flat compatibility palette', (modulePath) => {
    const source = readFileSync(require.resolve(modulePath), 'utf8');

    expect(source).toContain('useAppTheme');
    expect(source).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from ['"][^'"]*theme['"]/s);
    expect(source).toContain('theme.surface');
    expect(source).toContain('theme.ink');
    expect(source).toContain('theme.border');
  });
});
