import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const feedSource = readFileSync(require.resolve('../app/(app)/index'), 'utf8');
const proofCardSource = readFileSync(require.resolve('./FeedProofCard'), 'utf8');
const brandHeaderSource = readFileSync(require.resolve('./SocialBrandHeader'), 'utf8');
const storyRailSource = readFileSync(require.resolve('../stories/StoryRail'), 'utf8');

function styleBlock(componentSource: string, styleName: string): string {
  const match = componentSource.match(
    new RegExp(`(?:^|\\n)\\s*${styleName}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`),
  );
  return match?.[1] ?? '';
}

describe('Feed manual appearance contract', () => {
  test.each([
    ['Feed', feedSource, 'theme.surface.card'],
    ['post', proofCardSource, 'theme.surface.canvas'],
    ['My Day rail', storyRailSource, 'theme.surface.card'],
  ])('%s resolves presentation colors from the active app theme', (_name, source, surfaceToken) => {
    expect(source).toContain('useAppTheme');
    expect(source).toContain('createStyles(theme)');
    expect(source).toContain(surfaceToken);
    expect(source).toContain('theme.ink.muted');
    expect(source).toContain('theme.border.subtle');
    expect(source).not.toMatch(
      /(?:backgroundColor|borderColor|borderTopColor|color):\s*colors\.(?:card|surfaceAlt|text|textSecondary|textMuted|border)/,
    );
  });

  test('themes the composer sheet and loading feedback without changing the photo overlay', () => {
    expect(feedSource).toContain('const { colors: theme } = useAppTheme()');
    expect(feedSource).toContain('tint="dark"');
    expect(feedSource).toContain('backgroundColor: theme.interaction.scrim');
    expect(feedSource).toContain('backgroundColor: theme.interaction.skeleton');
    expect(feedSource).toContain('tintColor={theme.ink.action}');
    expect(feedSource).toContain("photoPreview: { flex: 1, justifyContent: 'center', backgroundColor: '#000' }");
    expect(feedSource).not.toContain("mode === 'light'");
  });

  test('uses semantic action and status roles for every Create-sheet icon tint', () => {
    expect(feedSource).toContain("tint: theme.ink.action, title: 'Post'");
    expect(feedSource).toContain("tint: theme.ink.action, title: 'My Day'");
    expect(feedSource).toContain("tint: theme.status.attention, title: 'Win card'");
    expect(feedSource).toContain("tint: theme.status.success, title: 'Group'");
    expect(feedSource).toContain("tint: theme.ink.secondary, title: 'Page'");
    expect(feedSource).not.toMatch(/tint: '#(?:db2777|f59e0b|0d9488)'/i);
  });

  test('keeps dark status icons readable with a canvas-colored Feed safe-area header', () => {
    expect(brandHeaderSource).toContain('useAppTheme');
    expect(brandHeaderSource).toContain('createStyles(theme)');
    expect(brandHeaderSource).toContain('backgroundColor: theme.surface.canvas');
    expect(brandHeaderSource).not.toContain('borderBottomWidth');
    expect(brandHeaderSource).toContain('color={theme.ink.action}');
    expect(brandHeaderSource).toContain('<BrandWordmark compact />');
  });

  test('uses the theme canvas for flat posts and a muted pre-image fallback', () => {
    expect(styleBlock(proofCardSource, 'card')).toContain(
      'backgroundColor: theme.surface.canvas',
    );
    expect(styleBlock(proofCardSource, 'authorHeader')).toContain(
      'backgroundColor: theme.surface.canvas',
    );
    expect(styleBlock(proofCardSource, 'actions')).toContain(
      'backgroundColor: theme.surface.canvas',
    );
    expect(styleBlock(proofCardSource, 'media')).toContain(
      'backgroundColor: theme.surface.muted',
    );
    expect(styleBlock(proofCardSource, 'media')).not.toContain(
      'backgroundColor: theme.surface.inverse',
    );
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
    expect(storyRailSource).toContain('backgroundColor: theme.surface.canvas');
  });

  test('uses the quiet canvas for Feed loading, empty, and ad states', () => {
    expect(feedSource).toContain('backgroundColor: theme.surface.canvas');
    expect(styleBlock(feedSource, 'skeletonCard')).not.toContain('borderRadius');
    expect(styleBlock(feedSource, 'skeletonCard')).not.toContain('borderWidth');
    expect(styleBlock(feedSource, 'emptyCard')).not.toContain('borderWidth');
    expect(styleBlock(feedSource, 'adWrap')).not.toContain('borderRadius');
  });

  test('keeps dashboard recovery states compact and editorial', () => {
    expect(styleBlock(feedSource, 'offlineNotice')).toContain('minHeight: 40');
    expect(styleBlock(feedSource, 'offlineNotice')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(styleBlock(feedSource, 'inlineError')).toContain('marginHorizontal: spacing.lg');
    expect(styleBlock(feedSource, 'inlineError')).toContain('borderRadius: radius.md');
    expect(styleBlock(feedSource, 'feedDivider')).toContain('marginHorizontal: spacing.lg');
    expect(styleBlock(feedSource, 'emptyCard')).not.toContain('borderWidth');
    expect(feedSource).toContain('emptyPrimary: { minHeight: spacing.touch');
    expect(feedSource).toContain('emptySecondary: { minHeight: spacing.touch');
  });
});
