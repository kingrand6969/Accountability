import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const feedSource = readFileSync(require.resolve('../app/(app)/index'), 'utf8');
const proofCardSource = readFileSync(require.resolve('./FeedProofCard'), 'utf8');
const brandHeaderSource = readFileSync(require.resolve('./SocialBrandHeader'), 'utf8');
const storyRailSource = readFileSync(require.resolve('../stories/StoryRail'), 'utf8');

describe('Feed manual appearance contract', () => {
  test.each([
    ['Feed', feedSource],
    ['post card', proofCardSource],
    ['My Day rail', storyRailSource],
  ])('%s resolves presentation colors from the active app theme', (_name, source) => {
    expect(source).toContain('useAppTheme');
    expect(source).toContain('createStyles(theme)');
    expect(source).toContain('theme.surface.card');
    expect(source).toContain('theme.ink.muted');
    expect(source).toContain('theme.border.subtle');
    expect(source).not.toMatch(
      /(?:backgroundColor|borderColor|borderTopColor|color):\s*colors\.(?:card|surfaceAlt|text|textSecondary|textMuted|border)/,
    );
  });

  test('themes the composer sheet and loading feedback without changing the photo overlay', () => {
    expect(feedSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(feedSource).toContain('tint={mode}');
    expect(feedSource).toContain('backgroundColor: theme.interaction.scrim');
    expect(feedSource).toContain('backgroundColor: theme.interaction.skeleton');
    expect(feedSource).toContain('tintColor={theme.ink.action}');
    expect(feedSource).toContain("photoPreview: { flex: 1, justifyContent: 'center', backgroundColor: '#000' }");
  });

  test('keeps dark status icons readable by theming the Feed safe-area header', () => {
    expect(brandHeaderSource).toContain('useAppTheme');
    expect(brandHeaderSource).toContain('createStyles(theme)');
    expect(brandHeaderSource).toContain('backgroundColor: theme.surface.card');
    expect(brandHeaderSource).toContain('borderBottomColor: theme.border.subtle');
    expect(brandHeaderSource).toContain('color={theme.ink.action}');
    expect(brandHeaderSource).toContain('color: theme.ink.primary');
  });

  test('uses accessible semantic action and status roles on every Feed surface', () => {
    expect(feedSource).toContain('color: theme.ink.primary');
    expect(feedSource).toContain('backgroundColor: theme.status.dangerSoft');
    expect(feedSource).toContain('color: theme.status.danger');
    expect(feedSource).toContain('backgroundColor: theme.ink.action');
    expect(proofCardSource).toContain('color={active ? theme.ink.action : theme.ink.muted}');
    expect(proofCardSource).toContain('color: theme.ink.primary');
    expect(proofCardSource).toContain('backgroundColor: theme.status.successSoft');
    expect(proofCardSource).toContain('borderColor: theme.status.success');
    expect(storyRailSource).toContain('borderColor: theme.ink.action');
    expect(storyRailSource).toContain('backgroundColor: theme.surface.muted');
  });
});
