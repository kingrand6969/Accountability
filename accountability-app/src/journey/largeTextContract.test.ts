import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const momentumSource = fs.readFileSync(path.join(__dirname, 'MomentumScreen.tsx'), 'utf8');
const tabsSource = fs.readFileSync(path.join(__dirname, 'JourneyTabs.tsx'), 'utf8');

describe('Journey large-text reflow', () => {
  test('uses flexible progress rows instead of fixed-position artwork at every font scale', () => {
    expect(momentumSource).toContain('styles.momentumPanel');
    expect(momentumSource).toContain('styles.pillarContent');
    expect(momentumSource).toContain('styles.pillarTrack');
    expect(momentumSource).not.toContain('styles.orbit');
  });

  test('keeps the next action and section headings from colliding', () => {
    expect(momentumSource).toContain('largeText && styles.nextCardLargeText');
    expect(momentumSource).toContain('largeText && styles.sectionHeaderLargeText');
  });

  test('uses a compact visual Momentum label while preserving its accessible name', () => {
    expect(tabsSource).toContain("fontScale >= 1.25 && tab.key === 'momentum'");
    expect(tabsSource).toContain("'Now'");
    expect(tabsSource).toContain('accessibilityLabel={`${tab.label} journey tab`}');
  });
});
