import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('app shell UX contract', () => {
  test('uses one branded, readable loading surface for auth, fonts, and onboarding hydration', () => {
    const rootLayout = source('src/app/_layout.tsx');
    const appLayout = source('src/app/(app)/_layout.tsx');
    const loadingSurface = source('src/ui/AppLaunchState.tsx');

    expect(rootLayout).toContain("import { AppLaunchState } from '../ui/AppLaunchState';");
    expect(rootLayout).toContain('<AppLaunchState message="Opening AccountAbility" />');
    expect(appLayout).toContain("import { AppLaunchState } from '../../ui/AppLaunchState';");
    expect(appLayout).toContain('<AppLaunchState message="Getting your training ready" />');
    expect(appLayout).not.toMatch(
      /if\s*\(\s*onboarded\s*===\s*null\s*\)\s*return\s*<View\s+style=\{\{\s*flex:\s*1\s*\}\}\s*\/>/,
    );

    expect(loadingSurface).toContain('accessibilityLiveRegion="polite"');
    expect(loadingSurface).toContain("accessibilityRole={error ? 'alert' : 'progressbar'}");
    expect(loadingSurface).toContain('accessibilityRole="button"');
    expect(loadingSurface).toContain('minHeight: spacing.touch');
    expect(loadingSurface).toContain('backgroundColor: theme.surface.canvas');
    expect(loadingSurface).toContain('tintColor: theme.ink.primary');
    expect(loadingSurface).toContain('minHeight: 48');
  });

  test('routes Help & support to the actual Help screen', () => {
    const profile = source('src/app/(app)/profile.tsx');

    expect(profile).toContain(
      '<SettingsRow icon="help-circle-outline" label="Help & support" route="/help" last />',
    );
    expect(profile).not.toContain(
      '<SettingsRow icon="help-circle-outline" label="Help & support" route="/menu" last />',
    );
  });
});
