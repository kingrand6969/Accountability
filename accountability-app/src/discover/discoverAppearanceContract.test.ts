import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

function styleBlock(componentSource: string, styleName: string): string {
  const match = componentSource.match(
    new RegExp(`(?:^|\\n)\\s*${styleName}:\\s*\\{([\\s\\S]*?)\\}`),
  );
  return match?.[1] ?? '';
}

describe('Discover and connection appearance contract', () => {
  test('Discover hub uses the permanent semantic dark palette without a Light fallback', () => {
    const hub = source('src/discover/DiscoverHub.tsx');

    expect(hub).toContain('const { colors: theme } = useAppTheme();');
    expect(hub).toContain('const palette = useMemo(() => discoverHubPalette(theme), [theme]);');
    expect(hub).toContain('const styles = useMemo(() => createStyles(palette), [palette]);');
    expect(hub).toContain('canvas: theme.surface.canvas');
    expect(hub).toContain('card: theme.surface.card');
    expect(hub).toContain('text: theme.ink.primary');
    expect(hub).toContain('action: theme.ink.action');
    expect(hub).toContain('backgroundColor: palette.canvas');
    expect(hub).toContain('backgroundColor: palette.card');
    expect(hub).toContain('borderColor: palette.border');
    expect(hub).toContain('color: palette.text');
    expect(hub).not.toContain('const styles = StyleSheet.create({');
    expect(hub).not.toContain("mode === 'light'");
  });

  test('full Discover themes every state while retaining privacy guards, destinations, and 48dp hit areas', () => {
    const discover = source('src/discover/DiscoverExperience.tsx');

    expect(discover).toContain('const { colors: theme } = useAppTheme();');
    expect(discover).toContain('const appearance = useMemo(() => createDiscoverAppearance(theme), [theme]);');
    expect(discover).toContain('mutedSurface: theme.surface.muted');
    expect(discover).toContain('textFaint: theme.ink.muted');
    expect(discover).toContain('backgroundColor: palette.canvas');
    expect(discover).toContain('backgroundColor: palette.card');
    expect(discover).toContain('backgroundColor: palette.mutedSurface');
    expect(discover).toContain('color: palette.text');
    expect(discover).toContain('color: palette.textMuted');
    expect(discover).toContain('loadGuardRef.current.canCommit(ticket, currentOwnerRef.current)');
    expect(discover).toContain("router.push('/search' as never)");
    expect(discover).toContain("pathname: '/buddy-card/[id]'");
    expect(discover).toContain("pathname: '/challenge/[id]'");
    expect(discover).toContain('hitSlop={6}');
    expect(discover).toContain('hitSlop={DISCOVER_TOUCH_INSET.small}');
    expect(discover).not.toContain('const styles = StyleSheet.create({');
    expect(discover).not.toContain("mode === 'light'");
  });

  test('Browse all expands people inside Discover and never opens the parallel legacy Buddy flow', () => {
    const discover = source('src/discover/DiscoverExperience.tsx');

    expect(discover).toContain('const [showAllPeople, setShowAllPeople] = useState(scope === \'people\');');
    expect(discover).toContain('const visiblePeople = showAllPeople ? sortedPeople : sortedPeople.slice(0, 4);');
    expect(discover).toContain('onPress={() => setShowAllPeople(true)}');
    expect(discover).not.toContain("router.push('/buddy' as never)");
  });

  test('candidate fallback and overlay chrome use semantic dark roles without recoloring media', () => {
    const discover = source('src/discover/DiscoverExperience.tsx');

    expect(discover).toContain('raisedSurface: theme.surface.raised');
    expect(discover).toContain('scrim: theme.interaction.scrim');
    expect(styleBlock(discover, 'personHero')).toContain('backgroundColor: palette.raisedSurface');
    expect(styleBlock(discover, 'personScrim')).toContain('backgroundColor: palette.scrim');
    expect(styleBlock(discover, 'personName')).toContain('color: palette.text');
    expect(styleBlock(discover, 'personMeta')).toContain('color: palette.textSecondary');
    expect(styleBlock(discover, 'areaBadge')).toContain('backgroundColor: palette.card');
    expect(styleBlock(discover, 'areaBadgeText')).toContain('color: palette.text');
    expect(styleBlock(discover, 'realTrait')).toContain('backgroundColor: palette.mutedSurface');
    expect(styleBlock(discover, 'realTraitText')).toContain('color: palette.textSecondary');
    expect(styleBlock(discover, 'levelText')).toContain('color: palette.textSecondary');
    expect(styleBlock(discover, 'progressTrack')).toContain('backgroundColor: palette.border');
    expect(discover).toContain('<ImageBackground');
  });

  test('global search themes its input, history, results, and icons without weakening account isolation', () => {
    const search = source('src/app/search.tsx');

    expect(search).toContain('const { colors: theme } = useAppTheme();');
    expect(search).toContain('const appearance = useMemo(() => createSearchAppearance(theme), [theme]);');
    expect(search).toContain('placeholderTextColor={palette.textFaint}');
    expect(search).toContain('backgroundColor: palette.canvas');
    expect(search).toContain('backgroundColor: palette.mutedSurface');
    expect(search).toContain('backgroundColor: palette.card');
    expect(search).toContain('color: palette.text');
    expect(search).toContain('color: palette.textMuted');
    expect(search).toContain('requestOwner !== currentOwnerRef.current');
    expect(search).toContain("pathname: '/buddy-card/[id]'");
    expect(search).toContain("router.push(`/group/${g.id}` as never)");
    expect(search).toContain("router.push(`/page/${p.id}` as never)");
    expect(search).toContain('hitSlop={spacing.lg}');
    expect(search).not.toContain('const styles = StyleSheet.create({');
    expect(search).not.toContain("mode === 'light'");
  });

  test('Buddy connection flow themes opt-in, tabs, lists, and actions while preserving consent and routes', () => {
    const buddy = source('src/app/buddy.tsx');

    expect(buddy).toContain('const { colors: theme } = useAppTheme();');
    expect(buddy).toContain('const palette = useMemo(() => buddyPalette(theme), [theme]);');
    expect(buddy).toContain('const styles = useMemo(() => createStyles(palette), [palette]);');
    expect(buddy).toContain('placeholderTextColor={palette.textFaint}');
    expect(buddy).toContain('backgroundColor: palette.canvas');
    expect(buddy).toContain('backgroundColor: palette.card');
    expect(buddy).toContain('backgroundColor: palette.mutedSurface');
    expect(buddy).toContain('color: palette.text');
    expect(buddy).toContain('color: palette.textMuted');
    expect(buddy).toContain('await setBuddyOptIn(true)');
    expect(buddy).toContain("router.push('/buddy-card-edit' as never)");
    expect(buddy).toContain("pathname: '/buddy-card/[id]'");
    expect(buddy).toContain("pathname: '/buddy-chat/[id]'");
    expect(buddy).toContain('hitSlop={spacing.sm}');
    expect(buddy).not.toContain('const styles = StyleSheet.create({');
    expect(buddy).not.toContain("mode === 'light'");
  });
});
