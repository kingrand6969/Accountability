import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, spacing } from './theme';

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
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { hour12, minute, ampm } = parse(value);
  const [minText, setMinText] = useState(pad(minute));
  const [open, setOpen] = useState<null | 'hour' | 'ampm'>(null);

  // sync the minute box if the time is set from outside (e.g. voice auto-fill)
  useEffect(() => {
    if (clampMin(minText) !== minute) setMinText(pad(minute));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute]);

  function onMinChange(s: string) {
    const digits = s.replace(/[^0-9]/g, '').slice(0, 2);
    setMinText(digits);
    onChange(compose(hour12, clampMin(digits), ampm));
  }

  return (
    <View style={styles.row}>
      <Trigger label={String(hour12)} onPress={() => setOpen('hour')} />
      <Text style={styles.colon}>:</Text>
      <TextInput
        style={styles.minInput}
        value={minText}
        onChangeText={onMinChange}
        onBlur={() => setMinText(pad(clampMin(minText)))}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="00"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="Minutes"
      />
      <Trigger label={ampm} onPress={() => setOpen('ampm')} wide />

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <View style={styles.menu}>
            <ScrollView>
              {open === 'hour'
                ? HOURS.map((h) => (
                    <MenuItem
                      key={h}
                      label={String(h)}
                      selected={h === hour12}
                      onPress={() => {
                        onChange(compose(h, clampMin(minText), ampm));
                        setOpen(null);
                      }}
                    />
                  ))
                : (['AM', 'PM'] as const).map((ap) => (
                    <MenuItem
                      key={ap}
                      label={ap}
                      selected={ap === ampm}
                      onPress={() => {
                        onChange(compose(hour12, clampMin(minText), ap));
                        setOpen(null);
                      }}
                    />
                  ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Trigger({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, wide && styles.triggerWide, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.triggerText}>{label}</Text>
      <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
    </Pressable>
  );
}

function MenuItem({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, selected && styles.menuItemSel, pressed && styles.pressed]}
    >
      <Text style={[styles.menuText, selected && styles.menuTextSel]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colon: { fontFamily: font.extrabold, fontSize: 20, color: colors.text, marginHorizontal: -2 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    minWidth: 62,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  triggerWide: { minWidth: 76 },
  triggerText: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  minInput: {
    minWidth: 62,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  menu: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    maxHeight: 320,
    width: 160,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
  },
  menuItemSel: { backgroundColor: colors.primarySoft },
  menuText: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  menuTextSel: { color: colors.primary },
});
