import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { RankBadge } from '../achievements/RankBadge';
import { RANK_ORDER, type RankName } from '../achievements/rankAssets';
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
import { presentationTraitName } from './presentation';

const TRAIT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Cheering: 'heart-outline',
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
  const rankName = RANK_ORDER.includes(card.rank_name as RankName)
    ? (card.rank_name as RankName)
    : null;
  const traits = card.show_traits ? card.traits?.filter(Boolean).slice(0, 3) ?? [] : [];
  const identityMeta = [
    card.show_area && area ? area : null,
    card.show_last_active && lastActive ? `Active ${timeAgo(lastActive)}` : null,
  ].filter((value): value is string => Boolean(value));
  const showRank = Boolean(card.show_rank && rankName);

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

        <View style={styles.rankDetails}>
          {showRank && rankName ? (
            <View testID="buddy-card-rank-inline" style={styles.rankInline}>
              <RankBadge
                rank={rankName}
                size={24}
                animated={false}
                effects="none"
                variant="crest"
              />
              <Text style={[styles.rankName, { color: palette.accent }]}>{rankName}</Text>
            </View>
          ) : null}
          <View style={styles.challengeWinsRow}>
            <Ionicons name="trophy" size={10} color={palette.accent} />
            <Text style={[styles.challengeWins, { color: palette.textMuted }]}>
              Challenges won · {card.show_challenge_wins && metrics?.chwin != null
                ? Math.round(metrics.chwin)
                : EMPTY_VALUE}
            </Text>
          </View>
        </View>
      </View>

      {traits.length > 0 ? (
        <View style={styles.traitRow}>
          {traits.map((trait) => {
            const label = presentationTraitName(trait);
            return (
              <View
                key={trait}
                style={[styles.trait, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Ionicons
                  name={TRAIT_ICONS[label] ?? 'checkmark-circle-outline'}
                  size={14}
                  color={palette.accent}
                />
                <Text style={[styles.traitText, { color: palette.text }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            );
          })}
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
    {
      label: 'Country',
      value: card.show_country_rank ? formatRank(boardRank?.countryRank) : EMPTY_VALUE,
    },
    {
      label: 'City',
      value: card.show_city_rank ? formatRank(boardRank?.cityRank) : EMPTY_VALUE,
    },
    {
      label: 'Buddies',
      value: card.show_consistency ? formatRank(metrics?.buddiesRank) : EMPTY_VALUE,
    },
    {
      label: 'Points',
      value: card.show_points ? formatWholeNumber(metrics?.points) : EMPTY_VALUE,
    },
  ];

  return (
    <View
      testID="buddy-card-rankings"
      style={styles.rankingsSection}
    >
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>Rankings</Text>
        <Text style={[styles.sectionAction, { color: palette.accent }]}>YOUR POSITION</Text>
      </View>
      <View
        testID="buddy-card-ranking-row"
        style={[styles.rankingRow, { borderColor: palette.border }]}
      >
        {items.map((item) => (
          <Metric
            key={item.label}
            {...item}
            palette={palette}
            layout="ranking"
            accessibilityLabel={`${item.label === 'Points' ? 'Points' : `${item.label} ranking`}, ${
              item.value === EMPTY_VALUE ? 'unavailable' : item.value
            }`}
          />
        ))}
      </View>
    </View>
  );
}

function BuddyCardSocialProof({
  stats,
  ownerView,
  mutualBuddiesCount,
  groupsCount,
  palette,
}: {
  stats: BuddyStats | null;
  ownerView: boolean;
  mutualBuddiesCount: number | null;
  groupsCount: number | null;
  palette: BuddyCardPalette;
}): React.JSX.Element | null {
  const items = [
    { label: 'Cheers', value: formatWholeNumber(stats?.cheers) },
    { label: 'Buddies', value: formatWholeNumber(stats?.buddies) },
    ...(ownerView
      ? groupsCount == null
        ? []
        : [{ label: 'Groups', value: formatWholeNumber(groupsCount) }]
      : mutualBuddiesCount == null || mutualBuddiesCount <= 0
        ? []
        : [{ label: 'Mutual', value: formatWholeNumber(mutualBuddiesCount) }]),
  ];

  return (
    <View
      testID="buddy-card-social-proof"
      style={[
        styles.socialStrip,
        { backgroundColor: palette.surfaceTint, borderColor: palette.border },
      ]}
    >
      <View testID="buddy-card-social-row" style={styles.compactMetricRow}>
        {items.map((item) => (
          <Metric key={item.label} {...item} palette={palette} layout="compact" />
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
      <View testID="buddy-card-fitness-row" style={styles.compactMetricRow}>
        {items.map((item) => (
          <Metric key={item.label} {...item} palette={palette} layout="compact" />
        ))}
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
  palette,
  layout = 'compact',
  accessibilityLabel,
}: {
  label: string;
  value: string;
  palette: BuddyCardPalette;
  layout?: 'ranking' | 'compact';
  accessibilityLabel?: string;
}) {
  const groupedForAccessibility = accessibilityLabel !== undefined;

  return (
    <View
      testID={`buddy-card-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessible={groupedForAccessibility ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.metric,
        layout === 'ranking' ? styles.rankingMetric : styles.compactMetric,
      ]}
    >
      <Text
        accessible={groupedForAccessibility ? false : undefined}
        style={[styles.metricValue, { color: palette.text }]}
      >
        {value}
      </Text>
      <Text
        accessible={groupedForAccessibility ? false : undefined}
        style={[styles.metricLabel, { color: palette.textMuted }]}
      >
        {label}
      </Text>
    </View>
  );
}

function formatRank(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return EMPTY_VALUE;
  const rounded = Math.round(value);
  return rounded < 1 ? EMPTY_VALUE : `#${rounded}`;
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
  mutualBuddiesCount = null,
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
  mutualBuddiesCount?: number | null;
  groupsCount?: number | null;
  onPressMedals?: () => void;
}) {
  // The app shell currently uses its approved light appearance. Reading the
  // phone's system scheme here made this one card turn dark inside a light app.
  const palette = resolveBuddyCardPalette(card.palette_key, 'light');
  const presentedCard: BuddyCard = ownerView
    ? {
        ...card,
        show_area: true,
        show_rank: true,
        show_medals: true,
        show_challenge_wins: true,
        show_country_rank: true,
        show_city_rank: true,
        show_consistency: true,
        show_points: true,
        show_distance: true,
      }
    : card;

  return (
    <View
      testID="public-buddy-card"
      style={[styles.frame, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View
        testID="buddy-card-atmosphere"
        pointerEvents="none"
        style={[styles.atmosphere, { backgroundColor: palette.surfaceTint }]}
      />
      <View style={styles.content}>
        <BuddyCardIdentity
          name={name}
          area={area}
          avatar={avatar}
          memberSince={memberSince}
          lastActive={lastActive}
          card={presentedCard}
          metrics={metrics}
          palette={palette}
        />
        <BuddyCardFocus text={headline} palette={palette} />
        <BuddyCardRankings
          card={presentedCard}
          boardRank={boardRank}
          metrics={metrics}
          palette={palette}
        />
        <BuddyCardAchievements
          card={presentedCard}
          palette={palette}
          onPress={onPressMedals ?? NOOP}
        />
        <BuddyCardSocialProof
          stats={stats}
          ownerView={ownerView}
          mutualBuddiesCount={mutualBuddiesCount}
          groupsCount={groupsCount}
          palette={palette}
        />
        <BuddyCardFitnessMetrics card={presentedCard} metrics={metrics} palette={palette} />
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
    width: 220,
    height: 220,
    right: -110,
    top: -120,
    borderRadius: 110,
    opacity: 0.26,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  identitySection: {
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  avatarRing: {
    width: 86,
    height: 86,
    padding: 3,
    borderWidth: 2,
    borderRadius: 43,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    fontSize: 21,
    lineHeight: 26,
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
    marginTop: 6,
    alignItems: 'flex-start',
  },
  rankInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rankName: {
    fontFamily: font.extrabold,
    fontSize: 13,
  },
  challengeWinsRow: {
    minHeight: 18,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  challengeWins: {
    marginLeft: 0,
    fontFamily: font.semibold,
    fontSize: 10,
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
  rankingsSection: {
    paddingTop: spacing.lg,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: font.extrabold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  sectionAction: {
    fontFamily: font.extrabold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  lastSection: {
    paddingVertical: spacing.md,
  },
  rankingRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
  },
  socialStrip: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  compactMetricRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  metric: {
    paddingRight: spacing.sm,
  },
  rankingMetric: {
    flex: 1,
    minWidth: 0,
  },
  compactMetric: {
    flex: 1,
    minWidth: 0,
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
