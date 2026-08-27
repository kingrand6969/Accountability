import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import {
  font,
  radius,
  spacing,
  themeColors,
  type AppThemeColors,
  type AppThemeMode,
} from './theme';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function parse(value: string) {
  const [h, m] = value.split(':').map(Number);
  const h24 = Number.isFinite(h) ? h : 12;
  const mm = Number.isFinite(m) ? m : 0;
  return {
    hour12: ((h24 + 11) % 12) + 1,
    minute: mm,
    ampm: (h24 < 12 ? 'AM' : 'PM') as 'AM' | 'PM',
  };
}

function compose(hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  const h24 = ampm === 'PM' ? (hour12 % 12) + 12 : hour12 % 12;
  return `${pad(h24)}:${pad(minute)}`;
}

function clampMin(s: string): number {
  const n = parseInt(s || '0', 10);
  return Number.isFinite(n) ? Math.min(59, Math.max(0, n)) : 0;
}

/**
 * 12-hour time picker: hour dropdown (1–12), a manually-editable minute box
 * (e.g. 03, 18), and an AM/PM dropdown. Emits a 24h 'HH:MM' string.
 */
export function TimePicker({
  value,
  onChange,
  theme = themeColors('dark'),
  mode = 'dark',
}: {
  value: string;
  onChange: (v: string) => void;
  theme?: AppThemeColors;
  mode?: AppThemeMode;
}) {
  const palette = useMemo(() => timePickerPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const { hour12, minute, ampm } = parse(value);
  const [minuteDraft, setMinuteDraft] = useState(() => ({
    value,
    text: pad(minute),
  }));
  const minText =
    minuteDraft.value === value ? minuteDraft.text : pad(minute);
  const [open, setOpen] = useState<null | 'hour' | 'ampm'>(null);

  function onMinChange(s: string) {
    const digits = s.replace(/[^0-9]/g, '').slice(0, 2);
    const nextValue = compose(hour12, clampMin(digits), ampm);
    setMinuteDraft({ value: nextValue, text: digits });
    onChange(nextValue);
  }

  return (
    <View style={styles.row}>
      <Trigger
        label={String(hour12)}
        onPress={() => setOpen('hour')}
        palette={palette}
        styles={styles}
      />
      <Text style={styles.colon}>:</Text>
      <TextInput
        style={styles.minInput}
        value={minText}
        onChangeText={onMinChange}
        onBlur={() =>
          setMinuteDraft({ value, text: pad(clampMin(minText)) })
        }
        keyboardType="number-pad"
        maxLength={2}
        placeholder="00"
        placeholderTextColor={palette.placeholder}
        accessibilityLabel="Minutes"
      />
      <Trigger
        label={ampm}
        onPress={() => setOpen('ampm')}
        wide
        palette={palette}
        styles={styles}
      />

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <View style={styles.menu}>
            <BlurView intensity={50} tint="dark" style={styles.menuBlur} />
            <View style={styles.menuGlass} />
            <ScrollView>
              {open === 'hour'
                ? HOURS.map((h) => (
                    <MenuItem
                      key={h}
                      label={String(h)}
                      selected={h === hour12}
                      onPress={() => {
                        const nextValue = compose(h, clampMin(minText), ampm);
                        setMinuteDraft({ value: nextValue, text: minText });
                        onChange(nextValue);
                        setOpen(null);
                      }}
                      palette={palette}
                      styles={styles}
                    />
                  ))
                : (['AM', 'PM'] as const).map((ap) => (
                    <MenuItem
                      key={ap}
                      label={ap}
                      selected={ap === ampm}
                      onPress={() => {
                        const nextValue = compose(
                          hour12,
                          clampMin(minText),
                          ap,
                        );
                        setMinuteDraft({ value: nextValue, text: minText });
                        onChange(nextValue);
                        setOpen(null);
                      }}
                      palette={palette}
                      styles={styles}
                    />
                  ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Trigger({
  label,
  onPress,
  wide,
  palette,
  styles,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  palette: PickerPalette;
  styles: PickerStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, wide && styles.triggerWide, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.triggerText}>{label}</Text>
      <Ionicons name="chevron-down" size={15} color={palette.muted} />
    </Pressable>
  );
}

function MenuItem({
  label,
  selected,
  onPress,
  palette,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: PickerPalette;
  styles: PickerStyles;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, selected && styles.menuItemSel, pressed && styles.pressed]}
    >
      <Text style={[styles.menuText, selected && styles.menuTextSel]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={16} color={palette.action} /> : null}
    </Pressable>
  );
}

function timePickerPalette(theme: AppThemeColors, _mode: AppThemeMode) {
  return {
    text: theme.ink.primary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    field: theme.surface.raised,
    action: theme.ink.action,
    selectedSoft: theme.surface.muted,
    scrim: theme.interaction.scrim,
    menuBorder: theme.border.strong,
    menuGlass: theme.surface.card,
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = timePickerPalette(theme, mode);
  return StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { fontFamily: font.extrabold, fontSize: 20, color: palette.text, marginHorizontal: -2 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    minWidth: 62,
    minHeight: spacing.touch,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    backgroundColor: palette.field,
  },
  triggerWide: { minWidth: 76 },
  triggerText: { fontFamily: font.bold, fontSize: 16, color: palette.text },
  minInput: {
    minWidth: 62,
    minHeight: spacing.touch,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    backgroundColor: palette.field,
    fontFamily: font.bold,
    fontSize: 16,
    color: palette.text,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: palette.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  menu: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.menuBorder,
    paddingVertical: spacing.xs,
    maxHeight: 320,
    width: 160,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
  },
  // translucent tint keeps menu labels readable over the blur
  menuGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.menuGlass,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
  },
  menuItemSel: { backgroundColor: palette.selectedSoft },
  menuText: { fontFamily: font.semibold, fontSize: 16, color: palette.text },
  menuTextSel: { color: palette.action },
  });
}

type PickerPalette = ReturnType<typeof timePickerPalette>;
type PickerStyles = ReturnType<typeof createStyles>;
