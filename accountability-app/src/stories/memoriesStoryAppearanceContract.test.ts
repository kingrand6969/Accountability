import fs from 'fs';
import path from 'path';

import { describe, expect, test } from '@jest/globals';

import { themeColors, type AppThemeMode } from '../ui/theme';

function route(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../app/${relativePath}`), 'utf8');
}

const memories = route('memories.tsx');
const story = route('story/[userId].tsx');

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

describe('Memories and Story appearance contract', () => {
  test('Memories follows manual Light/Dark appearance without changing its Light palette', () => {
    expect(memories).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(memories).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(memories).toContain('useMemo(() => createStyles(theme, mode), [mode, theme])');
    expect(memories).toContain("const primaryInk = mode === 'light' ? colors.text : theme.ink.primary");
    expect(memories).toContain("const mutedInk = mode === 'light' ? colors.textMuted : theme.ink.muted");
    expect(memories).toContain('backgroundColor: theme.surface.raised');
    expect(memories).toContain('color={theme.ink.action}');
    expect(memories).toContain('color: primaryInk');
    expect(memories).toContain('color: mutedInk');
    expect(memories).not.toContain('const styles = StyleSheet.create');
    expect(memories).not.toContain('backgroundColor: colors.background');
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s Memories text and activity color keep useful contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.primary, theme.surface.raised)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.muted, theme.surface.raised)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.ink.action, theme.surface.raised)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('keeps the Memories viewer immersive and its compact actions at 48dp', () => {
    expect(memories).toContain("backgroundColor: 'rgba(0,0,0,0.94)'");
    expect(memories).toContain("viewerDate: { color: '#fff'");
    expect(memories).toContain("viewerPlace: { color: '#e2e8f0'");
    expect(memories).toContain('contentFit="contain"');
    expect(memories).toMatch(/transparent\s+animationType="fade"/);
    expect(memories).toContain('onRequestClose={() => setViewer(null)}');
    expect(memories).toMatch(/viewerBtn:\s*\{[^}]*width: 40,[^}]*height: 40,/s);
    expect(memories.match(/hitSlop=\{4\}/g)?.length).toBe(2);
  });

  test('keeps Story media-first in both appearances while theming interaction state', () => {
    expect(story).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(story).toContain('const { colors: theme } = useAppTheme()');
    expect(story).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(story).toContain("screen: { flex: 1, backgroundColor: '#000' }");
    expect(story).toMatch(/unavailable:\s*\{[^}]*backgroundColor: '#000'/s);
    expect(story).toMatch(/progressTrack:\s*\{\s*flex: 1,/s);
    expect(story).toContain("backgroundColor: 'rgba(255,255,255,0.35)'");
    expect(story).toContain("backgroundColor: 'rgba(0,0,0,0.55)'");
    expect(story).toContain("import { useResolvedImageUrl } from '../../media/useResolvedImageUrl'");
    expect(story).toContain('const resolvedStoryImageUrl = useResolvedImageUrl(story?.image_url)');
    expect(story).toContain('<Image source={{ uri: resolvedStoryImageUrl }} style={styles.image} resizeMode="contain" />');
    expect(story).not.toContain('<Image source={{ uri: story.image_url }}');
    expect(story).toContain('reporting && styles.reportBtnDisabled');
    expect(story).toContain('opacity: theme.interaction.disabledOpacity');
    expect(story).not.toContain('const styles = StyleSheet.create');
  });

  test('keeps Story navigation, privacy, receipts and playback lifecycle intact', () => {
    expect(story).toContain('void markStoryViewed(displayedStoryId, ownerId).catch(() => {})');
    expect(story).toContain('navigateBackSafely(router)');
    expect(story).toContain('target.user_id !== requestOwner');
    expect(story).toContain('canReportContent(ownerId, story.user_id)');
    expect(story).toContain('isStoryPlaybackPlayable({');
    expect(story).toContain('playback.reset()');
    expect(story).toContain('styles.tapLeft');
    expect(story).toContain('styles.tapRight');
  });

  test('preserves Memories loading and deletion behavior', () => {
    expect(memories).toContain('Promise.all([listMemories(), getMemoriesUsage()])');
    expect(memories).toContain('await deleteMemory(m)');
    expect(memories).toContain('confirmDestructive(');
    expect(memories).toContain('setItems((cur) => cur.filter((x) => x.id !== m.id))');
  });

  test('keeps every direct Story action at least 48dp without enlarging the media UI', () => {
    expect(story).toContain('hitSlop={16}');
    expect(story).toMatch(/closeBtn:\s*\{[^}]*width: 44,[^}]*height: 44,/s);
    expect(story).toMatch(/trashBtn:\s*\{[^}]*width: 44,[^}]*height: 44,/s);
    expect(story).toMatch(/reportBtn:\s*\{[^}]*width: 44,[^}]*height: 44,/s);
    expect(story.match(/hitSlop=\{8\}/g)?.length).toBe(3);
  });
});
