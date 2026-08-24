import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const winCardSource = readFileSync(require.resolve('../app/win-card'), 'utf8');
const inviteCardSource = readFileSync(require.resolve('../app/invite-card'), 'utf8');
const publicShareSource = readFileSync(require.resolve('../app/share/[id]'), 'utf8');
const paywallSource = readFileSync(require.resolve('../app/paywall'), 'utf8');

describe('sharing and upgrade appearance contract', () => {
  test('Win Card themes its controls without altering captured proof or guarded side effects', () => {
    expect(winCardSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(winCardSource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(winCardSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(winCardSource).toContain("mode === 'light' ? '#F8F5EE' : theme.surface.canvas");
    expect(winCardSource).toContain('backgroundColor: palette.surface');
    expect(winCardSource).toContain('<ProofCaptureCard context={captureContext} backgroundUri={shareBackgroundUri} />');
    expect(winCardSource).toContain('publishFlexFeedPost({');
    expect(winCardSource).toContain('saveImageToMemories(uri, null, null, expectedProofOwner(token))');
    expect(winCardSource).toContain('hitSlop={2}');
  });

  test('Invite Card keeps its export artwork exact while adapting the surrounding shell', () => {
    expect(inviteCardSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(inviteCardSource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(inviteCardSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(inviteCardSource).toContain("mode === 'light' ? '#F4F5F1' : theme.surface.canvas");
    expect(inviteCardSource).toContain("colors={['#111411', '#263223', '#446B00']}");
    expect(inviteCardSource).toContain("require('../../assets/images/logo.png')");
    expect(inviteCardSource).toContain("dialogTitle: 'Invite a buddy to AccountAbility'");
    expect(inviteCardSource).toContain('backgroundColor: palette.action');
  });

  test('public Share handoff remains safe and readable in both manual appearances', () => {
    expect(publicShareSource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(publicShareSource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(publicShareSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(publicShareSource).toContain("mode === 'light' ? colors.cream : theme.surface.canvas");
    expect(publicShareSource).toContain('canonicalPublicShareDestination(shareId)');
    expect(publicShareSource).toContain('executeShareHandoff({');
    expect(publicShareSource).toContain('await WebBrowser.openBrowserAsync(webUrl)');
    expect(publicShareSource).toContain('minHeight: spacing.touch');
  });

  test('Paywall themes all non-hero surfaces and keeps purchase and restore semantics', () => {
    expect(paywallSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(paywallSource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(paywallSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(paywallSource).toContain("mode === 'light' ? colors.background : theme.surface.canvas");
    expect(paywallSource).toContain("colors={['#263223', '#53634E', '#111411']}");
    expect(paywallSource).toContain('await billingAdapter().purchase(plan)');
    expect(paywallSource).toContain('await billingAdapter().restore()');
    expect(paywallSource).toContain('<PaywallRestoreButton');
    expect(paywallSource).toContain('backgroundColor: palette.restoreSurface');
    expect(paywallSource).toContain('restorePressed: { opacity: 0.92 }');
    expect(paywallSource).toContain('minHeight: spacing.touch');
  });
});
