import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const path = readFileSync(require.resolve('./JourneyPathScreen'), 'utf8');

describe('Journey Path athlete workspace design', () => {
  test('uses a compact milestone workspace without duplicate titles or clipped filters', () => {
    expect(path).toContain('styles.progressSummary');
    expect(path).toContain('styles.milestoneList');
    expect(path).toContain('styles.segmentedFilters');
    expect(path).not.toContain('<EditorialBackdrop />');
    expect(path).not.toContain('<Text style={styles.title}>Your Journey</Text>');
    expect(path).not.toContain('<ScrollView horizontal');
    expect(path).not.toContain("fontFamily: 'Georgia'");
  });
});
