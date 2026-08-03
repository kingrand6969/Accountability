import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../ui/theme';
import { Avatar } from './Avatar';
import type { PostEncourager } from './api';

/**
 * A zero-request feed preview. Counts are returned with the feed row, so a
 * 20-card feed does not fan out into 40 extra requests. Names, portraits,
 * comments and private voice URLs load only after the member opens the sheet.
 */
export function EncouragementBar({
  count,
  people,
  voices,
  authorName,
  onPress,
}: {
  count: number;
  people: PostEncourager[];
  voices: number;
  authorName: string | null;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  const author = authorName?.trim().split(/\s+/)[0] || 'this member';

  return (
    <Pressable
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${count} supporters`}
    >
      <View style={styles.iconStack} accessibilityElementsHidden>
        {people.slice(0, 3).map((person, index) => (
          <View key={person.id} style={[styles.avatar, { marginLeft: index ? -11 : 0, zIndex: 3 - index }]}>
            <Avatar url={person.avatar_url} name={person.name} size={34} />
          </View>
        ))}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {people[0]?.name?.split(/\s+/)[0] ?? `${count} ${count === 1 ? 'buddy' : 'buddies'}`}
          {count > 1 ? ` and ${count - 1} ${count === 2 ? 'other' : 'others'}` : ''} encouraging {author}
        </Text>
        <View style={styles.wave}>
          {[8, 15, 11, 20, 13, 17, 9, 19, 12, 16, 7, 14].map((height, index) => (
            <View key={index} style={[styles.waveLine, { height }]} />
          ))}
          <Text style={styles.summary}>
            {voices ? `${voices} voice` : 'See support'}
          </Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 64,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconStack: { minWidth: 44, height: 38, flexDirection: 'row', alignItems: 'center' },
  avatar: { borderRadius: 19, borderWidth: 2, borderColor: colors.cream },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 11.5 },
  wave: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveLine: { width: 2, borderRadius: 2, backgroundColor: colors.primary },
  summary: { color: colors.primary, fontFamily: font.bold, fontSize: 9.5, marginLeft: 5 },
  chevron: { color: colors.textMuted, fontFamily: font.regular, fontSize: 24 },
  pressed: { opacity: 0.72 },
});
