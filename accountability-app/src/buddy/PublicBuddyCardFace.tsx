import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RankBadge } from '../achievements/RankBadge';
import { Medal } from '../achievements/Medal';
import { medalsFromCard } from './BuddyCardFace';
import type { BuddyCard, CardMetrics } from './card';
import { authorLabel, timeAgo } from '../feed/format';
import { font, radius, spacing } from '../ui/theme';

const TRAIT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Encouraging: 'heart-outline',
  Consistent: 'calendar-outline',
  'Goal focused': 'flag-outline',
  'Morning training': 'sunny-outline',
  Running: 'walk-outline',
  'Gym focused': 'barbell-outline',
  Competitive: 'trophy-outline',
  'Beginner friendly': 'people-outline',
  'Daily check-ins': 'chatbubble-ellipses-outline',
};

export function PublicBuddyCardFace({
  name,
  area,
  avatar,
  lastActive,
  headline,
  card,
  metrics,
  onPressMedals,
}: {
  name: string | null;
  area: string | null;
  avatar: string | null;
  /** Accepted by the editor preview for compatibility; intentionally not publicized. */
  memberSince?: string;
  lastActive?: string | null;
  headline: string | null;
  card: BuddyCard;
  metrics: CardMetrics | null;
  onPressMedals?: () => void;
}) {
  const displayName = authorLabel(name);
  const rankName = card.rank_name || 'Rookie';
  const traits = card.traits?.filter(Boolean).slice(0, 3) ?? [];
  const medals = medalsFromCard(card).slice(0, 3);
  const activeCopy = lastActive ? `Active ${timeAgo(lastActive)}` : 'Activity not shared';
  const stats = [
    {
      icon: 'repeat-outline' as const,
      value: metrics ? `${Math.round(metrics.consistency)}%` : '—',
      label: 'Consistency',
    },
    {
      icon: 'sparkles-outline' as const,
      value: metrics ? String(Math.round(metrics.points)) : '—',
      label: 'Points',
    },
    {
      icon: 'map-outline' as const,
      value: metrics ? `${metrics.distance.toFixed(1)} km` : '—',
      label: 'Distance',
    },
    {
      icon: 'trophy-outline' as const,
      value: metrics ? String(Math.round(metrics.chwin)) : '—',
      label: 'Challenge wins',
    },
  ];

  return (
    <View style={styles.frame}>
      <LinearGradient
        colors={['#0b4fd8', '#07358f', '#051d52']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />

      <View style={styles.identityRow}>
        <View style={styles.avatarRing}>
          {avatar ? (
            <Image
              source={{ uri: avatar }}
              style={styles.avatar}
              accessibilityLabel={`${displayName}'s profile photo`}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={42} color="#2563eb" />
            </View>
          )}
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {area ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color="#dbeafe" />
              <Text style={styles.metaText} numberOfLines={1}>{area}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <View style={[styles.activeDot, !lastActive && styles.inactiveDot]} />
            <Text style={lastActive ? styles.activeText : styles.metaText}>{activeCopy}</Text>
          </View>
          <View style={styles.rankWrap}>
            <RankBadge rank={rankName} size={36} animated={false} />
          </View>
        </View>
      </View>

      <Text style={styles.headline}>
        {headline || 'Looking for positive people who want to stay accountable together.'}
      </Text>

      {traits.length ? (
        <View style={styles.traitRow}>
          {traits.map((trait) => (
            <View key={trait} style={styles.trait}>
              <Ionicons
                name={TRAIT_ICONS[trait] ?? 'checkmark-circle-outline'}
                size={15}
                color="#123b79"
              />
              <Text style={styles.traitText} numberOfLines={1}>{trait}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.statGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Ionicons name={stat.icon} size={22} color="#93c5fd" />
            <View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        onPress={medals.length && onPressMedals ? onPressMedals : undefined}
        disabled={!medals.length || !onPressMedals}
        accessibilityRole={medals.length && onPressMedals ? 'button' : undefined}
        accessibilityLabel="View all public achievements"
        style={({ pressed }) => [styles.achievements, pressed && styles.pressed]}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top achievements</Text>
          {medals.length && onPressMedals ? (
            <View style={styles.viewAll}>
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons name="chevron-forward" size={16} color="#93c5fd" />
            </View>
          ) : null}
        </View>
        {medals.length ? (
          <View style={styles.medalRow}>
            {medals.map((medal) => (
              <View key={medal.def.id} style={styles.medalItem}>
                <Medal state={medal} size={64} animate={false} />
                <Text style={styles.medalName} numberOfLines={1}>{medal.tierName}</Text>
                <Text style={styles.medalFamily} numberOfLines={1}>{medal.def.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Achievements will appear here as they are earned.</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    backgroundColor: '#07358f',
  },
  orbOne: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -100,
    right: -60,
    backgroundColor: 'rgba(96,165,250,0.24)',
  },
  orbTwo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    left: -90,
    bottom: 50,
    backgroundColor: 'rgba(14,165,233,0.12)',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 4,
    backgroundColor: '#fff',
    shadowColor: '#020617',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  identityCopy: { flex: 1, minWidth: 0, gap: 5 },
  name: { color: '#fff', fontFamily: font.extrabold, fontSize: 29, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flexShrink: 1, color: '#dbeafe', fontFamily: font.medium, fontSize: 13 },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#86efac' },
  inactiveDot: { backgroundColor: '#94a3b8' },
  activeText: { color: '#bbf7d0', fontFamily: font.bold, fontSize: 13 },
  rankWrap: { marginTop: 3, alignSelf: 'flex-start' },
  headline: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 21,
    lineHeight: 29,
    marginTop: spacing.lg,
  },
  traitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  trait: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  traitText: { color: '#123b79', fontFamily: font.bold, fontSize: 12 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  stat: {
    width: '50%',
    minHeight: 80,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  statValue: { color: '#fff', fontFamily: font.extrabold, fontSize: 22 },
  statLabel: { color: '#dbeafe', fontFamily: font.medium, fontSize: 11.5, marginTop: 1 },
  achievements: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(2,6,23,0.18)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  viewAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { color: '#93c5fd', fontFamily: font.bold, fontSize: 13 },
  medalRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  medalItem: { flex: 1, minWidth: 0, alignItems: 'center' },
  medalName: { color: '#fff', fontFamily: font.bold, fontSize: 11.5, marginTop: 3 },
  medalFamily: { color: '#bfdbfe', fontFamily: font.medium, fontSize: 9.5, marginTop: 1 },
  emptyText: { color: '#bfdbfe', fontFamily: font.regular, fontSize: 12.5, marginTop: 12 },
  pressed: { opacity: 0.76 },
});
