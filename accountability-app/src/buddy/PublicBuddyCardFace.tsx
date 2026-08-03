import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { RankBadge } from '../achievements/RankBadge';
import { Medal } from '../achievements/Medal';
import { medalsFromCard } from './BuddyCardFace';
import type { BuddyCard, CardMetrics } from './card';
import { authorLabel, timeAgo } from '../feed/format';
import { CachedImage } from '../ui/CachedImage';
import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';
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
  memberSince?: string;
  lastActive?: string | null;
  headline: string | null;
  card: BuddyCard;
  metrics: CardMetrics | null;
  onPressMedals?: () => void;
}) {
  const displayName = authorLabel(name);
  const resolvedHero = useResolvedMediaUrl(card.show_hero ? card.hero_url ?? null : null);
  const resolvedAvatar = useResolvedMediaUrl(avatar);
  const traits = card.show_traits ? card.traits?.filter(Boolean).slice(0, 3) ?? [] : [];
  const medals = card.show_medals ? medalsFromCard(card).slice(0, 3) : [];
  const stats = [
    card.show_consistency && metrics?.consistency != null
      ? { icon: 'repeat-outline' as const, value: `${Math.round(metrics.consistency)}%`, label: 'Consistency' }
      : null,
    card.show_points && metrics?.points != null
      ? { icon: 'sparkles-outline' as const, value: String(Math.round(metrics.points)), label: 'Points' }
      : null,
    card.show_distance && metrics?.distance != null
      ? { icon: 'map-outline' as const, value: `${metrics.distance.toFixed(1)} km`, label: 'Distance' }
      : null,
    card.show_challenge_wins && metrics?.chwin != null
      ? { icon: 'trophy-outline' as const, value: String(Math.round(metrics.chwin)), label: 'Challenge wins' }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <View style={styles.frame}>
      {resolvedHero ? (
        <CachedImage uri={resolvedHero} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={['#155EEF', '#0B3DAE', '#081A3A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(8,26,58,0.05)', 'rgba(8,26,58,0.88)']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.spacer} />
      <View style={styles.content}>
        <View style={styles.identityRow}>
          <View style={styles.avatarRing}>
            {resolvedAvatar ? (
              <CachedImage
                uri={resolvedAvatar}
                style={styles.avatar}
                contentFit="cover"
                accessibilityLabel={`${displayName}'s profile photo`}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={30} color="#155EEF" />
              </View>
            )}
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            {card.show_area && area ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color="#E8EEFA" />
                <Text style={styles.metaText} numberOfLines={1}>{area}</Text>
              </View>
            ) : null}
            {card.show_last_active && lastActive ? (
              <Text style={styles.metaText}>Active {timeAgo(lastActive)}</Text>
            ) : null}
          </View>
          {card.show_rank && card.rank_name ? (
            <RankBadge rank={card.rank_name} size={40} animated={false} />
          ) : null}
        </View>

        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        {traits.length ? (
          <View style={styles.traitRow}>
            {traits.map((trait) => (
              <View key={trait} style={styles.trait}>
                <Ionicons name={TRAIT_ICONS[trait] ?? 'checkmark-circle-outline'} size={14} color="#123B79" />
                <Text style={styles.traitText} numberOfLines={1}>{trait}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {stats.length ? (
          <View style={styles.statRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <Ionicons name={stat.icon} size={18} color="#BFD4FF" />
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {medals.length ? (
          <Pressable
            onPress={onPressMedals}
            disabled={!onPressMedals}
            accessibilityRole={onPressMedals ? 'button' : undefined}
            accessibilityLabel="View all public achievements"
            style={({ pressed }) => [styles.achievements, pressed && styles.pressed]}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top achievements</Text>
              {onPressMedals ? (
                <View style={styles.viewAll}>
                  <Text style={styles.viewAllText}>View all</Text>
                  <Ionicons name="chevron-forward" size={16} color="#BFD4FF" />
                </View>
              ) : null}
            </View>
            <View style={styles.medalRow}>
              {medals.map((medal) => (
                <View key={medal.def.id} style={styles.medalItem}>
                  <Medal state={medal} size={58} animate={false} />
                  <Text style={styles.medalName} numberOfLines={1}>{medal.tierName}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { minHeight: 520, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#081A3A' },
  spacer: { flex: 1, minHeight: 200 },
  content: { padding: spacing.lg, gap: spacing.md },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarRing: { width: 68, height: 68, borderRadius: 34, padding: 3, backgroundColor: '#fff' },
  avatar: { width: 62, height: 62, borderRadius: 31 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4FF' },
  identityCopy: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: '#fff', fontFamily: font.bold, fontSize: 23, letterSpacing: -0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#E8EEFA', fontFamily: font.medium, fontSize: 12 },
  headline: { color: '#fff', fontFamily: font.bold, fontSize: 23, lineHeight: 29 },
  traitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  trait: { minHeight: 36, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.94)' },
  traitText: { color: '#123B79', fontFamily: font.bold, fontSize: 11.5 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: radius.lg, overflow: 'hidden' },
  stat: { width: '50%', minHeight: 74, padding: 10, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)' },
  statValue: { marginTop: 3, color: '#fff', fontFamily: font.bold, fontSize: 17 },
  statLabel: { color: '#DCE7FA', fontFamily: font.medium, fontSize: 10.5 },
  achievements: { minHeight: 120, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: radius.lg, backgroundColor: 'rgba(8,26,58,0.44)' },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  viewAll: { minHeight: 44, minWidth: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  viewAllText: { color: '#BFD4FF', fontFamily: font.bold, fontSize: 12 },
  medalRow: { flexDirection: 'row', gap: 8 },
  medalItem: { flex: 1, minWidth: 0, alignItems: 'center' },
  medalName: { color: '#fff', fontFamily: font.bold, fontSize: 10.5, marginTop: 2 },
  pressed: { opacity: 0.76 },
});
