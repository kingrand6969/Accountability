import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const layoutSource = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');

describe('root layout contract', () => {
  test('keeps the approved provider and host order', () => {
    const orderedMarkers = [
      '<AuthProvider>',
      '<ActivitySyncProvider>',
      '<ProProvider>',
      '<RootNavigator />',
      '<ModerationGate />',
      '<ToastHost />',
      '<ConfirmHost />',
      '<PostMenuHost />',
      '</ProProvider>',
      '</ActivitySyncProvider>',
      '</AuthProvider>',
    ];

    let previousIndex = -1;
    for (const marker of orderedMarkers) {
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

    for (const font of [
      'Anton_400Regular',
      'Inter_400Regular',
      'Inter_500Medium',
      'Inter_600SemiBold',
      'Inter_700Bold',
      'Inter_800ExtraBold',
      'PlayfairDisplay_700Bold',
      'Caveat_600SemiBold',
    ]) {
      expect(layoutSource).toMatch(new RegExp(`\\n\\s+${font},`));
    }
  });

  test('waits for font loading but releases the shell when font loading errors', () => {
    expect(layoutSource).toMatch(
      /const\s+\[fontsLoaded,\s*fontError\]\s*=\s*useFonts\(/,
    );
    expect(layoutSource).toMatch(
      /if\s*\(\s*loading\s*\|\|\s*\(!fontsLoaded\s*&&\s*!fontError\)\s*\)/,
    );
    expect(layoutSource).not.toMatch(/if\s*\(\s*loading\s*\|\|\s*!fontsLoaded\s*\)/);
  });
});
