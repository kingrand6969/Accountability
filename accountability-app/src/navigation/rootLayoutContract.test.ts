import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const layoutSource = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');
const onboardingSource = fs.readFileSync(path.join(__dirname, '../app/onboarding.tsx'), 'utf8');
const consentPath = path.join(__dirname, '../app/consent-refresh.tsx');
const consentSource = fs.existsSync(consentPath) ? fs.readFileSync(consentPath, 'utf8') : '';

describe('root layout contract', () => {
  test('keeps the approved provider and host order', () => {
    const orderedMarkers = [
      '<LocationCollectorBootGate>',
      '<AuthProvider>',
      '<LegalConsentProvider>',
      '<AuthRouteIntentProvider>',
      '<ConsentPriorityRuntime />',
      '</AuthRouteIntentProvider>',
      '</LegalConsentProvider>',
      '</AuthProvider>',
      '</LocationCollectorBootGate>',
    ];

    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const markerIndex = layoutSource.indexOf(marker, previousIndex + 1);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }

    const runtimeMarkers = [
      "const locationGateEnabled = consent.status === 'signed-out' || consent.status === 'current';",
      '<LocationCollectorOwnerGate enabled={locationGateEnabled}>',
      '<ActivitySyncProvider>',
      '<ProProvider>',
      '<RootNavigator />',
      '<ModerationGate />',
      '<ToastHost />',
      '<ConfirmHost />',
      '<PostMenuHost />',
      '</ProProvider>',
      '</ActivitySyncProvider>',
      '</LocationCollectorOwnerGate>',
    ];

    previousIndex = -1;
    for (const marker of runtimeMarkers) {
      const markerIndex = layoutSource.indexOf(marker, previousIndex + 1);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }
  });

  test('loads the approved display and handwritten fonts with the existing families', () => {
    expect(layoutSource).toContain(
      "import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';",
    );
    expect(layoutSource).toContain(
      "import { Caveat_600SemiBold } from '@expo-google-fonts/caveat/600SemiBold';",
    );
    expect(layoutSource).toContain(
      "import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';",
    );
    expect(layoutSource).toContain(
      "import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';",
    );
    expect(layoutSource).toContain(
      "import { BowlbyOneSC_400Regular } from '@expo-google-fonts/bowlby-one-sc/400Regular';",
    );

    for (const font of [
      'Anton_400Regular',
      'Inter_400Regular',
      'Inter_500Medium',
      'Inter_600SemiBold',
      'Inter_700Bold',
      'Inter_800ExtraBold',
      'PlayfairDisplay_700Bold',
      'Caveat_600SemiBold',
      'SpaceGrotesk_700Bold',
      'Sora_700Bold',
      'BowlbyOneSC_400Regular',
    ]) {
      expect(layoutSource).toMatch(new RegExp(`\\n\\s+${font},`));
    }
  });

  test('waits for font loading but releases the shell when font loading errors', () => {
    expect(layoutSource).toMatch(
      /const\s+\[fontsLoaded,\s*fontError\]\s*=\s*useFonts\(/,
    );
    expect(layoutSource).toMatch(/if\s*\(\s*loading\s*\|\|/);
    expect(layoutSource).toContain('|| (!fontsLoaded && !fontError))');
    expect(layoutSource).not.toMatch(/if\s*\(\s*loading\s*\|\|\s*!fontsLoaded\s*\)/);
  });

  test('does not mount Post in the root Android stack', () => {
    expect(layoutSource).not.toContain('<Stack.Screen name="post/[id]"');
  });

  test('keeps stale consent on its own route and requires current consent for protected app use', () => {
    const rootNavigatorStart = layoutSource.indexOf('function RootNavigator()');
    const rootNavigatorEnd = layoutSource.indexOf('function ConsentPriorityRuntime()', rootNavigatorStart);
    const rootNavigatorSource = layoutSource.slice(rootNavigatorStart, rootNavigatorEnd);

    expect(layoutSource).toContain('const intentController = useAuthRouteIntentController()');
    expect(rootNavigatorSource).not.toContain(
      'useState(() => createAuthRouteIntentController(ownerId))',
    );
    expect(layoutSource).toMatch(
      /<Stack\.Protected guard=\{!!session && consent\.status !== 'current'\}>\s*<Stack\.Screen\s+name="consent-refresh"\s+options=\{\{ gestureEnabled: false \}\}\s*\/>\s*<\/Stack\.Protected>/,
    );
    expect(layoutSource).toMatch(
      /<Stack\.Protected guard=\{!!session && consent\.status === 'current'\}>\s*<Stack\.Screen name="onboarding" \/>\s*<\/Stack\.Protected>/,
    );
    expect(layoutSource).toContain(
      "<Stack.Protected guard={!!session && consent.status === 'current' && onboarded === true}>",
    );

    const appGuard = layoutSource.indexOf(
      "<Stack.Protected guard={!!session && consent.status === 'current' && onboarded === true}>",
    );
    const appGuardEnd = layoutSource.indexOf('</Stack.Protected>', appGuard);
    const protectedAppRoutes = layoutSource.slice(appGuard, appGuardEnd);
    for (const route of ['(app)', 'compose', 'win-card', 'story/[userId]']) {
      expect(protectedAppRoutes).toContain(`name="${route}"`);
    }
    expect(protectedAppRoutes).not.toContain('name="onboarding"');
    expect(layoutSource).toContain('<Stack.Screen name="legal/[doc]"');
    expect(layoutSource).toMatch(
      /<Stack\.Protected guard=\{!session \|\| consent\.status === 'current'\}>\s*<Stack\.Screen name="share\/\[id\]"/,
    );
  });

  test('the consent wall cannot be dismissed without acceptance or sign-out', () => {
    expect(consentSource).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(consentSource).toContain('return true');
    expect(consentSource).toContain("router.push('/legal/terms')");
    expect(consentSource).toContain("router.push('/legal/privacy')");
    expect(consentSource).toContain("'Accept updated Terms and Privacy Policy'");
    expect(consentSource).toContain('await consent.accept()');
    expect(consentSource).toContain('await supabase.auth.signOut()');
    expect(consentSource).not.toMatch(/checked|defaultChecked|auto.?accept/i);
  });

  test('loading and offline consent states stay on an actionable wall', () => {
    expect(layoutSource).not.toContain('<AppLaunchState message="Checking your agreement" />');
    expect(consentSource).toContain("const checking = consent.status === 'loading'");
    expect(consentSource).toContain("checking ? 'Checking your agreement' :");
    expect(consentSource).toContain('Checking whether this account has accepted the current Terms and Privacy Policy.');
    expect(consentSource).toContain("checkFailed ? 'Try again' : 'Accept and continue'");
    expect(consentSource).toContain("title=\"Sign out\"");
    expect(consentSource).toContain("accessibilityLabel=\"Sign out instead\"");
  });

  test('signals successful onboarding to the root lifecycle instead of racing a local redirect', () => {
    expect(onboardingSource).toContain('notifyOnboardingComplete(expectedOwner)');
    expect(onboardingSource).not.toContain("router.replace('/')");
  });
});
