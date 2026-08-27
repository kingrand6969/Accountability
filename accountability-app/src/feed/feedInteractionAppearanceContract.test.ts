import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sources = {
  broadcast: readFileSync(path.resolve(__dirname, 'BroadcastSheet.tsx'), 'utf8'),
  encouragement: readFileSync(path.resolve(__dirname, 'EncouragementSheet.tsx'), 'utf8'),
  recorder: readFileSync(path.resolve(__dirname, 'VoiceEncouragementRecorder.tsx'), 'utf8'),
  menu: readFileSync(path.resolve(__dirname, 'PostMenu.tsx'), 'utf8'),
  confirm: readFileSync(path.resolve(__dirname, '../ui/ConfirmDialog.tsx'), 'utf8'),
};
const socialSources = Object.entries(sources).filter(([name]) => name !== 'confirm');

describe('Feed interaction appearance contract', () => {
  test.each(socialSources)(
    '%s uses permanent semantic dark roles without an appearance fork',
    (_name, source) => {
      expect(source).toContain('useAppTheme');
      expect(source).toContain('const { colors: theme } = useAppTheme()');
      expect(source).toContain('createStyles(theme)');
      expect(source).toContain('theme.interaction.scrim');
      expect(source).not.toContain("mode === 'light'");
      expect(source).not.toContain("mode === 'dark'");
      expect(source).not.toContain("themeColors('dark')");
      expect(source).not.toContain('darkStyles');
      expect(source).not.toContain('useColorScheme');
    },
  );

  test('confirm uses permanent semantic dark roles without a light fallback', () => {
    expect(sources.confirm).toContain('useAppTheme');
    expect(sources.confirm).toContain('const { colors: theme } = useAppTheme()');
    expect(sources.confirm).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(sources.confirm).toContain('tint="dark"');
    expect(sources.confirm).toContain('backgroundColor: theme.interaction.scrim');
    expect(sources.confirm).toContain('backgroundColor: withAlpha(theme.surface.card, 0.88)');
    expect(sources.confirm).toContain('borderColor: theme.border.strong');
    expect(sources.confirm).not.toContain("mode === 'dark'");
    expect(sources.confirm).not.toContain('darkStyles');
    expect(sources.confirm).not.toContain("'light'");
  });

  test('uses semantic sheet, ink, border, action, inverse, and status roles throughout', () => {
    expect(sources.confirm).toContain('tint="dark"');

    for (const source of Object.values(sources)) {
      expect(source).toContain('theme.surface');
      expect(source).toContain('theme.ink');
      expect(source).toContain('theme.border');
    }
    expect(sources.broadcast).toContain('backgroundColor: theme.status.success');
    expect(sources.encouragement).toContain('backgroundColor: theme.surface.card');
    expect(sources.recorder).toContain('backgroundColor: theme.ink.action');
    expect(sources.menu).toContain('backgroundColor: theme.status.dangerSoft');
  });

  test('keeps modal exits and lifecycle actions while exposing 48dp controls', () => {
    expect(sources.broadcast).toContain('onRequestClose={onClose}');
    expect(sources.encouragement).toContain('onRequestClose={onClose}');
    expect(sources.recorder).toContain('onRequestClose={onClose}');
    expect(sources.menu).toContain('onRequestClose={close}');
    expect(sources.confirm).toContain('onRequestClose={close}');

    for (const source of Object.values(sources)) {
      const minimums = [...source.matchAll(/minHeight:\s*(\d+)/g)].map((match) => Number(match[1]));
      expect(minimums.length).toBeGreaterThan(0);
      expect(minimums.every((height) => height >= 48)).toBe(true);
    }
  });
});
