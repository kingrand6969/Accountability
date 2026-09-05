import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { font, radius, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

type Privacy = 'public' | 'private';

/** Two-option segmented control: 🌐 Public / 🔒 Private. */
export function PrivacyToggle({
  value,
  onChange,
  publicHint,
  privateHint,
}: {
  value: Privacy;
  onChange: (v: Privacy) => void;
  publicHint: string;
  privateHint: string;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Segment
          icon="globe-outline"
          label="Public"
              selected={value === 'public'}
              onPress={() => onChange('public')}
              styles={styles}
              theme={theme}
        />
        <Segment
          icon="lock-closed-outline"
          label="Private"
              selected={value === 'private'}
              onPress={() => onChange('private')}
              styles={styles}
              theme={theme}
        />
      </View>
      <Text style={styles.hint}>{value === 'public' ? publicHint : privateHint}</Text>
    </View>
  );
}

function Segment({
  icon,
  label,
  selected,
  onPress,
  styles,
  theme,
}: {
  icon: 'globe-outline' | 'lock-closed-outline';
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.segment, selected && styles.segmentSel, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={selected ? theme.ink.action : theme.ink.muted} />
      <Text style={[styles.segmentText, selected && styles.segmentTextSel]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    backgroundColor: theme.surface.muted,
    borderRadius: radius.sm,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.sm - 2,
  },
  segmentSel: {
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.action,
  },
  segmentText: { fontFamily: font.semibold, fontSize: 14.5, color: theme.ink.muted },
  segmentTextSel: { color: theme.ink.action, fontFamily: font.bold },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: theme.ink.muted, paddingHorizontal: 2 },
  pressed: { opacity: 0.75 },
});
