import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font } from '../ui/theme';

type Option<T extends string> = Readonly<{ id: T; label: string }>;

export function RunShareOptionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0];
  const kind = label.toLocaleLowerCase();
  return (
    <>
      <Pressable
        style={styles.trigger}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected?.label ?? ''}`}
        accessibilityHint={`Choose a different ${kind}`}
        accessibilityState={{ disabled, expanded: open }}
      >
        <View style={styles.triggerCopy}>
          <Text style={styles.label}>{label.toLocaleUpperCase()}</Text>
          <Text numberOfLines={1} style={styles.value}>{selected?.label}</Text>
        </View>
        <Ionicons name="chevron-down" size={17} color="#D8E2EA" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={`Close ${kind} choices`}
        >
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            <Text accessibilityRole="header" style={styles.menuTitle}>Choose {kind}</Text>
            {options.map((option) => {
              const active = option.id === value;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.option, active && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${option.label} ${kind}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                  {active ? <Ionicons name="checkmark" size={19} color="#C8FF45" /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334452',
    borderRadius: 13,
    backgroundColor: '#15232E',
    paddingHorizontal: 12,
  },
  triggerCopy: { flex: 1, minWidth: 0 },
  label: { color: '#8293A0', fontFamily: font.bold, fontSize: 8, letterSpacing: 0.8 },
  value: { marginTop: 2, color: '#FFFFFF', fontFamily: font.extrabold, fontSize: 13 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.66)', padding: 18 },
  menu: { borderRadius: 22, backgroundColor: '#101D27', padding: 12, gap: 4 },
  menuTitle: { color: '#FFFFFF', fontFamily: font.extrabold, fontSize: 18, paddingHorizontal: 8, paddingVertical: 10 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 13, paddingHorizontal: 14 },
  optionActive: { backgroundColor: 'rgba(200,255,69,0.1)' },
  optionText: { color: '#D8E2EA', fontFamily: font.bold, fontSize: 15 },
  optionTextActive: { color: '#C8FF45' },
});
