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

  test.each([
    './AppLaunchState',
    './AuthField',
    './ConfirmDialog',
    './Glass',
    './MonthCalendar',
    './TimePicker',
  ])('%s contains no light appearance branch or legacy primary-dark role', (modulePath) => {
    const source = readFileSync(require.resolve(modulePath), 'utf8');

    expect(source).not.toContain("mode === 'light'");
    expect(source).not.toContain("themeColors('light')");
    expect(source).not.toContain('colors.primaryDark');
    expect(source).not.toContain('legacyColors.primaryDark');
  });

  test.each(['./AuthShell', './ConfirmDialog', './Glass', './TimePicker'])(
    '%s never requests a light app-owned blur tint',
    (modulePath) => {
      const source = readFileSync(require.resolve(modulePath), 'utf8');

      expect(source).not.toMatch(/tint=(?:\{|)["']light["']/);
      expect(source).not.toContain("? 'light' : 'dark'");
      expect(source).not.toContain("? 'dark' : 'light'");
    },
  );
});
