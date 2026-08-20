import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const buddyMap = readFileSync(require.resolve('../app/buddy-map'), 'utf8');

describe('Buddy Map appearance contract', () => {
  test('uses the live competition palette for every Glass Card foreground', () => {
    expect(buddyMap).toContain("import { useCompetitionTheme, type CompetitionPalette } from '../compete/CompeteUI'");
    expect(buddyMap).toContain('const { palette } = useCompetitionTheme()');
    expect(buddyMap).toContain('const styles = useMemo(() => createStyles(palette), [palette])');
    expect(buddyMap).toContain('const createStyles = (palette: CompetitionPalette)');
    expect(buddyMap).toContain('color: palette.ink');
    expect(buddyMap).toContain('color: palette.inkSoft');
    expect(buddyMap).toContain('color: palette.accent');
    expect(buddyMap).not.toMatch(/\b(?:INK|INK_SOFT|ACCENT)\b/);
  });

  test('preserves the light glass treatment while adding visible dark borders and switch state', () => {
    expect(buddyMap).toContain('borderColor: palette.segmentBorder');
    expect(buddyMap).toContain('backgroundColor: palette.subtleAccent');
    expect(buddyMap).toContain("trackColor={{ true: palette.accent, false: palette.inputBorder }}");
    expect(buddyMap).toContain("color: r.user_id === uid ? palette.accent : '#7D6E9D'");
    expect(buddyMap).toContain('width: 44');
    expect(buddyMap).toContain('height: 44');
  });

  test('does not alter location consent, ownership, or refresh behavior', () => {
    expect(buddyMap).toContain('await Location.requestForegroundPermissionsAsync()');
    expect(buddyMap).toContain('await pushLiveLocation(pos.coords.latitude, pos.coords.longitude)');
    expect(buddyMap).toContain('await stopLiveLocation()');
    expect(buddyMap).toContain('const mine = rows.find((r) => r.user_id === uid) ?? null');
    expect(buddyMap).toContain('await load(); // keep the spinner until state reflects reality (no OFF flicker)');
  });
});
