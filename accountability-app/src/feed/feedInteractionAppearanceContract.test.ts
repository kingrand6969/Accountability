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

describe('Feed interaction appearance contract', () => {
  test.each(Object.entries(sources))(
    '%s follows the manual app appearance and semantic dark roles',
    (_name, source) => {
      expect(source).toContain('useAppTheme');
      expect(source).toContain("mode === 'dark'");
      expect(source).toContain("themeColors('dark')");
      expect(source).toContain('darkStyles');
      expect(source).not.toContain('useColorScheme');
    },
  );

  test('keeps every Light foundation visible while adding dark sheet, ink, border, and action roles', () => {
    expect(sources.broadcast).toContain('backgroundColor: colors.card');
    expect(sources.encouragement).toContain('backgroundColor: colors.cream');
    expect(sources.recorder).toContain('backgroundColor: colors.cream');
    expect(sources.menu).toContain('backgroundColor: colors.card');
    expect(sources.confirm).toContain("tint={dark ? 'dark' : 'light'}");

    for (const source of Object.values(sources)) {
      expect(source).toContain('theme.surface');
      expect(source).toContain('theme.ink');
      expect(source).toContain('theme.border');
    }
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
