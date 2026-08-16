import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { RankBadge } from '../achievements/RankBadge';
import { authorLabel, timeAgo } from '../feed/format';
import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';
import { CachedImage } from '../ui/CachedImage';
import { font, radius, shadow, spacing } from '../ui/theme';
import { BuddyCardAchievements } from './BuddyCardAchievements';
import { BuddyCardFocus } from './BuddyCardFocus';
import type { BoardRank, BuddyCard, BuddyStats, CardMetrics } from './card';
import {
  resolveBuddyCardPalette,
  type BuddyCardPaletteTokens as BuddyCardPalette,
} from './palette';

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

const NOOP = () => undefined;
const EMPTY_VALUE = '—';

type IdentityProps = {
  name: string | null;
  area: string | null;
  avatar: string | null;
  memberSince: string;
  lastActive: string | null;
  card: BuddyCard;
  metrics: CardMetrics | null;
  palette: BuddyCardPalette;
};

function BuddyCardIdentity({
  name,
  area,
  avatar,
  memberSince,
  lastActive,
  card,
  metrics,
  palette,
}: IdentityProps): React.JSX.Element {
  const displayName = authorLabel(name);
  const resolvedAvatar = useResolvedMediaUrl(avatar);
  const rankName = card.rank_name || 'Rookie';
  const traits = card.show_traits ? card.traits?.filter(Boolean).slice(0, 3) ?? [] : [];
  const identityMeta = [
    card.show_area && area ? area : null,
    card.show_last_active && lastActive ? `Active ${timeAgo(lastActive)}` : null,
  ].filter((value): value is string => Boolean(value));
  const showRankDetails = Boolean(card.show_rank || card.show_challenge_wins);

  return (
    <View testID="buddy-card-identity" style={styles.identitySection}>
      <View style={[styles.avatarRing, { borderColor: palette.accent }]}>
        {resolvedAvatar ? (
          <CachedImage
            uri={resolvedAvatar}
            style={styles.avatar}
            contentFit="cover"
            accessibilityLabel={`${displayName}'s profile photo`}
          />
        ) : (
          <View
            style={[styles.avatar, styles.avatarFallback, { backgroundColor: palette.surfaceTint }]}
          >
            <Ionicons name="person" size={32} color={palette.accent} />
          </View>
        )}
      </View>

      <View style={styles.identityCopy}>
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>
          {displayName}
        </Text>
        {identityMeta.length > 0 ? (
          <Text style={[styles.identityMeta, { color: palette.textMuted }]} numberOfLines={2}>
            {identityMeta.join(' · ')}
          </Text>
        ) : null}
        <Text style={[styles.memberSince, { color: palette.textMuted }]}>
          Member since {memberSince}
        </Text>

        {showRankDetails ? (
          <View style={styles.rankDetails}>
            {card.show_rank ? (
              <View testID="buddy-card-rank-inline" style={styles.rankInline}>
                <RankBadge rank={rankName} size={32} animated={false} effects="none" />
                <Text style={[styles.rankName, { color: palette.text }]}>{rankName}</Text>
              </View>
            ) : null}
            {card.show_challenge_wins ? (
              <Text
                style={[
                  styles.challengeWins,
                  !card.show_rank && styles.challengeWinsWithoutRank,
                  { color: palette.textMuted },
                ]}
              >
                Challenges won · {metrics?.chwin == null ? EMPTY_VALUE : Math.round(metrics.chwin)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {traits.length > 0 ? (
        <View style={styles.traitRow}>
          {traits.map((trait) => (
            <View
              key={trait}
              style={[styles.trait, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Ionicons
                name={TRAIT_ICONS[trait] ?? 'checkmark-circle-outline'}
                size={14}
                color={palette.accent}
              />
              <Text style={[styles.traitText, { color: palette.text }]} numberOfLines={1}>
                {trait}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BuddyCardRankings({
  card,
  boardRank,
  metrics,
  palette,
}: {
  card: BuddyCard;
  boardRank: BoardRank | null;
  metrics: CardMetrics | null;
  palette: BuddyCardPalette;
}): React.JSX.Element | null {
  const items = [
    card.show_country_rank
      ? { label: 'Country', value: formatRank(boardRank?.countryRank) }
      : null,
    card.show_city_rank ? { label: 'City', value: formatRank(boardRank?.cityRank) } : null,
    card.show_rank ? { label: 'Buddies', value: formatRank(metrics?.buddiesRank) } : null,
    card.show_points
      ? { label: 'Points', value: formatWholeNumber(metrics?.points) }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (items.length === 0) return null;

  return (
    <View
      testID="buddy-card-rankings"
      style={[styles.section, { borderBottomColor: palette.border }]}
    >
      <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Rankings</Text>
      <View style={styles.metricGrid}>
        {items.map((item) => (
          <Metric key={item.label} {...item} palette={palette} />
        ))}
      </View>
    </View>
  );
}

function BuddyCardSocialProof({
  stats,
  ownerView,
  groupsCount,
  palette,
}: {
  stats: BuddyStats | null;
  ownerView: boolean;
  groupsCount: number | null;
  palette: BuddyCardPalette;
}): React.JSX.Element | null {
  if (!stats && (!ownerView || groupsCount == null)) return null;

  const items = [
    { label: 'Cheers', value: formatWholeNumber(stats?.cheers) },
    { label: 'Buddies', value: formatWholeNumber(stats?.buddies) },
    ownerView
      ? { label: 'Groups', value: formatWholeNumber(groupsCount) }
      : { label: 'Mutual', value: EMPTY_VALUE },
  ];

  return (
    <View
      testID="buddy-card-social-proof"
      style={[styles.section, { borderBottomColor: palette.border }]}
    >
      <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Social</Text>
      <View style={styles.metricGrid}>
        {items.map((item) => (
          <Metric key={item.label} {...item} palette={palette} />
        ))}
      </View>
    </View>
  );
}

function BuddyCardFitnessMetrics({
  card,
  metrics,
  palette,
}: {
  card: BuddyCard;
  metrics: CardMetrics | null;
  palette: BuddyCardPalette;
}): React.JSX.Element | null {
  if (!metrics) return null;

  const items = [
    card.show_consistency && metrics.consistency != null
      ? { label: 'Consistency', value: `${Math.round(metrics.consistency)}%` }
      : null,
    card.show_points && metrics.points != null
      ? { label: 'Points', value: formatWholeNumber(metrics.points) }
      : null,
    card.show_distance && metrics.avgkm != null
      ? { label: 'Avg km/day', value: `${metrics.avgkm.toFixed(2)} km` }
      : null,
    card.show_distance && metrics.distance != null
      ? { label: 'Distance', value: `${metrics.distance.toFixed(1)} km` }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (items.length === 0) return null;

  return (
    <View testID="buddy-card-fitness" style={styles.lastSection}>
      <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>Fitness</Text>
      <View style={styles.metricGrid}>
        {items.map((item) => (
          <Metric key={item.label} {...item} palette={palette} />
        ))}
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: BuddyCardPalette;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

function formatRank(value: number | null | undefined) {
  return value == null ? EMPTY_VALUE : `#${Math.round(value)}`;
}

function formatWholeNumber(value: number | null | undefined) {
  return value == null ? EMPTY_VALUE : Math.round(value).toLocaleString('en-US');
}

export function PublicBuddyCardFace({
  name,
  area,
  avatar,
  memberSince = EMPTY_VALUE,
  lastActive = null,
  headline,
  card,
  stats = null,
  boardRank = null,
  metrics,
  ownerView = false,
  groupsCount = null,
  onPressMedals,
}: {
  name: string | null;
  area: string | null;
  avatar: string | null;
  memberSince?: string;
  lastActive?: string | null;
  headline: string | null;
  card: BuddyCard;
  stats?: BuddyStats | null;
  boardRank?: BoardRank | null;
  metrics: CardMetrics | null;
  ownerView?: boolean;
  groupsCount?: number | null;
  onPressMedals?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = resolveBuddyCardPalette(card.palette_key, scheme);

  return (
    <View
      testID="public-buddy-card"
      style={[styles.frame, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View
        pointerEvents="none"
        style={[styles.atmosphere, { backgroundColor: palette.surfaceTint }]}
      />
      <View
        testID="buddy-card-accent"
        pointerEvents="none"
        style={[styles.accent, { backgroundColor: palette.accent }]}
      />
      <View style={styles.content}>
        <BuddyCardIdentity
          name={name}
          area={area}
          avatar={avatar}
          memberSince={memberSince}
          lastActive={lastActive}
          card={card}
          metrics={metrics}
          palette={palette}
        />
        <BuddyCardFocus text={headline} palette={palette} />
        <BuddyCardRankings card={card} boardRank={boardRank} metrics={metrics} palette={palette} />
        <BuddyCardAchievements card={card} palette={palette} onPress={onPressMedals ?? NOOP} />
        <BuddyCardSocialProof
          stats={stats}
          ownerView={ownerView}
          groupsCount={groupsCount}
          palette={palette}
        />
        <BuddyCardFitnessMetrics card={card} metrics={metrics} palette={palette} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    ...shadow.card,
  },
  atmosphere: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 132,
  },
  accent: {
    height: 4,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  identitySection: {
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  avatarRing: {
    width: 78,
    height: 78,
    padding: 3,
    borderWidth: 2,
    borderRadius: 39,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    minWidth: 180,
  },
  name: {
    fontFamily: font.extrabold,
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.45,
  },
  identityMeta: {
    marginTop: 3,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 18,
  },
  memberSince: {
    marginTop: 2,
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 17,
  },
  rankDetails: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
  },
  rankInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rankName: {
    fontFamily: font.extrabold,
    fontSize: 17,
  },
  challengeWins: {
    marginTop: 2,
    marginLeft: 104,
    fontFamily: font.semibold,
    fontSize: 11.5,
  },
  challengeWinsWithoutRank: {
    marginLeft: 0,
  },
  traitRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  trait: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  traitText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
  },
  section: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastSection: {
    paddingVertical: spacing.lg,
  },
  sectionLabel: {
    marginBottom: spacing.md,
    fontFamily: font.extrabold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  metric: {
    width: '25%',
    minWidth: 72,
    paddingRight: spacing.sm,
  },
  metricValue: {
    fontFamily: font.extrabold,
    fontSize: 16,
    lineHeight: 21,
  },
  metricLabel: {
    marginTop: 2,
    fontFamily: font.medium,
    fontSize: 10.5,
    lineHeight: 15,
  },
});
