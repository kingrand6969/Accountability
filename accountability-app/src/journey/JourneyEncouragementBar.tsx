import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import type { JourneyEncouragement } from './encouragement';
import { colors, font, spacing } from '../ui/theme';

export function JourneyEncouragementBar({
  value,
  dark = false,
  onPress,
}: {
  value: JourneyEncouragement | null;
  dark?: boolean;
  onPress(): void;
}) {
  const first = value?.people[0];
  const copy = value
    ? `${authorLabel(first?.name ?? null)}${value.count > 1 ? ` and ${value.count - 1} ${value.count === 2 ? 'other' : 'others'}` : ''} encouraged you`
    : 'No encouragement on your recent proofs yet.';
  return (
    <Pressable
      disabled={!value}
      onPress={onPress}
      style={({ pressed }) => [styles.bar, dark && styles.barDark, !value && styles.empty, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !value }}
      accessibilityLabel={value ? `${copy}. Open encouragement.` : copy}
    >
      <View style={styles.faces}>
        {value?.people.length ? value.people.map((person, index) => (
          <View key={person.id} style={[styles.face, { marginLeft: index ? -10 : 0, zIndex: 3 - index }]}>
            <Avatar url={person.avatar_url} name={person.name} size={36} />
          </View>
        )) : (
          <View style={styles.placeholder}><Ionicons name="heart-outline" size={18} color={colors.primary} /></View>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, dark && styles.titleDark]}>Encouragement</Text>
        <Text style={[styles.meta, dark && styles.metaDark]} numberOfLines={2}>{copy}</Text>
      </View>
      {value?.hasVoice ? <Ionicons name="pulse" size={22} color={colors.primary} accessibilityLabel="Includes voice encouragement" /> : null}
      <Ionicons name="chevron-forward" size={18} color={dark ? '#AFC1D7' : colors.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 72, borderRadius: 15, paddingHorizontal: spacing.md, backgroundColor: '#F0E9DC', borderWidth: 1, borderColor: 'rgba(99,79,46,0.14)', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barDark: { backgroundColor: 'rgba(10,57,95,0.95)', borderColor: 'rgba(120,178,225,0.19)' },
  empty: { opacity: 0.82 },
  faces: { minWidth: 42, flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 20 },
  placeholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
  titleDark: { color: '#FFFFFF' },
  meta: { color: colors.inkSoft, fontFamily: font.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
  metaDark: { color: '#AFC1D7' },
  pressed: { opacity: 0.7 },
});
