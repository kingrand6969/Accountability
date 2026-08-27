import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const addSource = readFileSync(require.resolve('../app/add'), 'utf8');
const calendarSource = readFileSync(require.resolve('../ui/MonthCalendar'), 'utf8');
const timePickerSource = readFileSync(require.resolve('../ui/TimePicker'), 'utf8');
const detailSource = readFileSync(require.resolve('../app/item/[id]'), 'utf8');

describe('Planner create and detail appearance contract', () => {
  test('the schedule composer follows the live manual appearance without changing its Light palette', () => {
    expect(addSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(addSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(addSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(addSource).toContain("mode === 'light' ? legacyColors.text : theme.ink.primary");
    expect(addSource).toContain('backgroundColor: palette.background');
    expect(addSource).toContain('borderColor: palette.border');
    expect(addSource).toContain('backgroundColor: palette.field');
    expect(addSource).toContain('backgroundColor: palette.scrim');
  });

  test('the month calendar defaults to permanent dark roles while retaining its date semantics and touch geometry', () => {
    expect(calendarSource).toContain('theme = themeColors(\'dark\')');
    expect(calendarSource).toContain("mode = 'dark'");
    expect(calendarSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(calendarSource).toContain('card: theme.surface.card');
    expect(calendarSource).toContain('border: theme.border.subtle');
    expect(calendarSource).toContain('action: theme.ink.action');
    expect(calendarSource).not.toContain("mode === 'light'");
    expect(calendarSource).toContain('backgroundColor: palette.card');
    expect(calendarSource).toContain('borderColor: palette.border');
    expect(calendarSource).toContain('backgroundColor: palette.action');
    expect(calendarSource).toContain('accessibilityState={{ selected: isSel }}');
    expect(calendarSource).toContain('width: 40, height: 40');
  });

  test('the time picker uses permanent dark controls and modal glass without changing minute entry behavior', () => {
    expect(timePickerSource).toContain('theme = themeColors(\'dark\')');
    expect(timePickerSource).toContain("mode = 'dark'");
    expect(timePickerSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(timePickerSource).toContain('tint="dark"');
    expect(timePickerSource).toContain('field: theme.surface.raised');
    expect(timePickerSource).toContain('scrim: theme.interaction.scrim');
    expect(timePickerSource).not.toContain("mode === 'light'");
    expect(timePickerSource).toContain('backgroundColor: palette.field');
    expect(timePickerSource).toContain('backgroundColor: palette.menuGlass');
    expect(timePickerSource).toContain('minHeight: spacing.touch');
    expect(timePickerSource).toContain("keyboardType=\"number-pad\"");
  });

  test('scheduled-item detail keeps checklist behavior while using readable Light and Dark surfaces', () => {
    expect(detailSource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(detailSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(detailSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(detailSource).toContain("mode === 'light' ? legacyColors.background : theme.surface.canvas");
    expect(detailSource).toContain('backgroundColor: palette.background');
    expect(detailSource).toContain('backgroundColor: palette.card');
    expect(detailSource).toContain('backgroundColor: palette.field');
    expect(detailSource).toContain('borderColor: palette.border');
    expect(detailSource).toContain('accessibilityRole="checkbox"');
    expect(detailSource).toContain('hitSlop={11}');
    expect(detailSource).toContain('minHeight: spacing.touch');
  });
});
