import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import type { JourneyEncouragement } from './encouragement';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export function JourneyEncouragementBar({
  value,
  onPress,
}: {
  value: JourneyEncouragement | null;
  dark?: boolean;
  onPress(): void;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const first = value?.people[0];
  const copy = value
    ? `${authorLabel(first?.name ?? null)}${value.count > 1 ? ` and ${value.count - 1} ${value.count === 2 ? 'other' : 'others'}` : ''} cheered you`
    : 'No Cheers on your recent proofs yet.';
  return (
    <Pressable
      disabled={!value}
      onPress={onPress}
      style={({ pressed }) => [styles.bar, !value && styles.empty, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !value }}
      accessibilityLabel={value ? `${copy}. Open Cheers.` : copy}
    >
      <View style={styles.faces}>
        {value?.people.length ? value.people.map((person, index) => (
          <View key={person.id} style={[styles.face, { marginLeft: index ? -10 : 0, zIndex: 3 - index }]}>
            <Avatar url={person.avatar_url} name={person.name} size={36} />
          </View>
        )) : (
          <View style={styles.placeholder}>
            <Ionicons name="heart-outline" size={18} color={theme.ink.action} />
          </View>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Cheers</Text>
        <Text style={styles.meta} numberOfLines={2}>{copy}</Text>
      </View>
      {value?.hasVoice ? (
        <Ionicons
          name="pulse"
          size={22}
          color={theme.ink.action}
          accessibilityLabel="Includes a voice Cheer"
        />
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.ink.muted} />
    </Pressable>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  bar: {
    minHeight: 72,
    borderRadius: 15,
    paddingHorizontal: spacing.md,
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  empty: { opacity: 0.82 },
  faces: { minWidth: 42, flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 2, borderColor: theme.surface.card, borderRadius: 20 },
  placeholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 12 },
  meta: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
  pressed: { opacity: 0.7 },
});
